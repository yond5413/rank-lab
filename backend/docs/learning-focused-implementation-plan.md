# X-Algorithm Learning-Focused Implementation Plan

> Comprehensive adaptation strategy for learning the x-algorithm architecture with CPU-only deployment on Render.

---

## Key Clarifications from Research

### 1. Training vs Fine-Tuning

**Misconception:** The x-algorithm trains a massive transformer from scratch on engagement data.

**Reality:** 
- **Grok transformer** is pre-trained (general language understanding)
- **Fine-tuning** adapts it for recommendations by training:
  - Custom input embeddings (convert engagement history to embeddings)
  - Attention masking for candidate isolation
  - Output scoring heads (predict P(like), P(reply), etc.)

**This is FINE-TUNING, not training from scratch.**

### 2. Global Model vs Per-User Training

**Misconception:** Each user has their own fine-tuned model.

**Reality:**
- **ONE global model** trained on ALL users' engagement data
- **Personalization** comes from feeding each user's unique history into the same model
- Think: "Given users like User_A, what do they tend to engage with?"

### 3. Two Components, Not One

**Phoenix System has TWO separate ML models:**

| Component | Purpose | Training | Input | Output |
|-----------|---------|----------|-------|--------|
| **Two-Tower Model** (Retrieval) | Find relevant posts from millions | Trained on engagement pairs | User history, posts | User embedding, Post embeddings |
| **Transformer Ranker** (Grok) | Score candidates for ranking | Fine-tuned on engagement data | User context + posts | P(like), P(reply), P(repost), etc. |

**Flow:** Retrieval (gets 100s of candidates) → Ranking (scores them) → Selection

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Client Request (User_ID)                      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                 1. QUERY HYDRATION (Parallel)                    │
│     • UserActionSeqQueryHydrator - engagement history           │
│     • UserFeaturesQueryHydrator - user profile features         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              2. CANDIDATE SOURCING (Parallel)                     │
│                                                                  │
│   ┌──────────────────────┐    ┌──────────────────────────┐     │
│   │  ThunderSource       │    │  PhoenixSource           │     │
│   │  (In-Network)        │    │  (Out-of-Network)        │     │
│   │                      │    │                          │     │
│   │  • Query Supabase    │    │  • User Tower encodes    │     │
│   │    for posts from    │    │    user history          │     │
│   │    followed accounts │    │  • Vector similarity     │     │
│   │  • Recent 100 posts  │    │    search in Supabase    │     │
│   │                      │    │  • Returns top 50 OON    │     │
│   └──────────┬───────────┘    └────────────┬─────────────┘     │
│              │                              │                   │
│              └──────────┬───────────────────┘                   │
│                         ▼                                       │
│              ┌────────────────────┐                           │
│              │  Merge Candidates  │                           │
│              │  (In + Out Network)│                           │
│              └─────────┬──────────┘                           │
└────────────────────────┼──────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│            3. CANDIDATE HYDRATORS (Parallel)                   │
│     • CoreDataCandidateHydrator - author info, timestamps        │
│     • InNetworkCandidateHydrator - mark in-network posts       │
│     • EngagementStatsHydrator - likes, replies, reposts counts │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│         4. PRE-SCORING FILTERS (Sequential)                      │
│     • DropDuplicatesFilter - remove duplicate posts              │
│     • AgeFilter - remove posts older than threshold              │
│     • PreviouslySeenFilter - remove already viewed posts         │
│     • AuthorSocialgraphFilter - remove blocked/muted authors     │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              5. SCORERS (Sequential - Order Matters)            │
│                                                                  │
│   ┌────────────────────────────────────────────────────────┐   │
│   │  PhoenixScorer (Transformer Ranker)                   │   │
│   │  • Takes user context + candidate posts                │   │
│   │  • Fine-tuned DistilBERT + classification heads        │   │
│   │  • Candidate isolation attention masking              │   │
│   │  • Outputs: P(like), P(reply), P(repost), ...        │   │
│   └────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│   ┌────────────────────────────────────────────────────────┐   │
│   │  WeightedScorer                                        │   │
│   │  • Combines predictions: Σ(weight_i × P(action_i))      │   │
│   │  • 12 engagement types with configurable weights        │   │
│   └────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│   ┌────────────────────────────────────────────────────────┐   │
│   │  AuthorDiversityScorer                                 │   │
│   │  • Reduces scores for repeated authors                 │   │
│   │  • Penalty: score *= 0.7^author_count                  │   │
│   └────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│   ┌────────────────────────────────────────────────────────┐   │
│   │  OONScorer (Out-of-Network Scorer)                     │   │
│   │  • Applies penalty to out-of-network posts             │   │
│   │  • Weight: 0.8 (vs 1.0 for in-network)                 │   │
│   └────────────────────────────────────────────────────────┘   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│               6. SELECTION                                       │
│     • TopKScoreSelector - sort by final score, return top 50     │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│          7. POST-SELECTION FILTERS (Sequential)                 │
│     • VFFilter - final visibility checks                         │
│     • DedupConversationFilter - avoid multiple posts from thread │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              Ranked Feed Response (Top 50 Posts)                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Strategy

### Phase 1: Pre-Trained Baseline (Week 1-2)

**Goal:** Working system with zero training

**Components:**
- Use sentence-transformers for embeddings (pre-trained)
- Simple cosine similarity for scoring
- Full pipeline structure without learned components

**Code Example:**
```python
from sentence_transformers import SentenceTransformer

class SimpleRecommendationPipeline:
    def __init__(self):
        # Pre-trained model - no training needed
        self.encoder = SentenceTransformer('all-MiniLM-L6-v2')
    
    def get_recommendations(self, user_id: str) -> List[Post]:
        # 1. Get user history
        user_history = self.get_user_engagement_history(user_id)
        user_text = " ".join([post.content for post in user_history])
        user_embedding = self.encoder.encode(user_text)
        
        # 2. Retrieve candidates
        candidates = self.get_candidate_posts(user_id)
        
        # 3. Score by similarity
        scored = []
        for post in candidates:
            post_embedding = self.encoder.encode(post.content)
            similarity = cosine_similarity(user_embedding, post_embedding)
            scored.append((post, similarity))
        
        # 4. Return top 50
        return sorted(scored, key=lambda x: x[1], reverse=True)[:50]
```

**Pros:**
- ✅ Runs immediately on Render CPU
- ✅ <500ms response time
- ✅ Full pipeline architecture in place

**Cons:**
- ❌ Not personalized to your specific users
- ❌ Doesn't learn from engagement data

---

### Phase 2: Two-Tower with Fine-Tuned Projections (Week 3-4)

**Goal:** Personalized retrieval without massive compute

**Architecture:**
```
User History ──> Pre-trained Encoder (frozen) ──> 384-d embedding
                                                    │
                                                    ▼
                                            User Projection Layer
                                              (trained: 384→256)
                                                    │
                                                    ▼
                                              256-d User Embedding

Post Content ──> Pre-trained Encoder (frozen) ──> 384-d embedding
                                                    │
                                                    ▼
                                            Candidate Projection
                                              (trained: 384→256)
                                                    │
                                                    ▼
                                              256-d Post Embedding

Retrieval: User Embedding · Post Embedding = Relevance Score
```

**Why This Works:**
- Base encoders already understand language (frozen)
- Projection layers learn your domain/users (trained)
- Tiny trainable footprint: ~200k parameters vs 66M+ for full fine-tuning

**Training Details:**

```python
class TwoTowerModel(nn.Module):
    def __init__(self):
        # Frozen base model
        self.base_encoder = SentenceTransformer('all-MiniLM-L6-v2')
        
        # Trainable projection layers only
        self.user_projection = nn.Linear(384, 256)
        self.candidate_projection = nn.Linear(384, 256)
    
    def forward(self, user_history, candidate_post):
        # Frozen: don't compute gradients for base
        with torch.no_grad():
            user_base = self.base_encoder.encode(user_history)
            cand_base = self.base_encoder.encode(candidate_post)
        
        # Trainable: only these layers update
        user_emb = self.user_projection(torch.tensor(user_base))
        cand_emb = self.candidate_projection(torch.tensor(cand_base))
        
        # Similarity score
        return F.cosine_similarity(user_emb, cand_emb)

# Training
training_pairs = [
    (user_A_history, post_X, label=1),  # User A engaged with post X
    (user_A_history, post_Y, label=0),  # User A didn't engage with post Y
    # ... thousands of such pairs
]

optimizer = torch.optim.Adam([
    *model.user_projection.parameters(),
    *model.candidate_projection.parameters()
], lr=0.001)

# Loss: contrastive learning
for user_hist, post, label in training_pairs:
    score = model(user_hist, post)
    loss = F.binary_cross_entropy_with_logits(score, torch.tensor(label))
    loss.backward()
    optimizer.step()
```

**Training Data Collection:**

```sql
-- New table for training pairs
CREATE TABLE training_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    user_embedding_history VECTOR(384), -- Snapshot of user's history embedding
    post_id UUID REFERENCES posts(id),
    post_embedding VECTOR(384), -- Snapshot of post embedding
    label BOOLEAN, -- 1: engaged, 0: negative sample
    created_at TIMESTAMP DEFAULT NOW()
);

-- Generate negative samples (posts shown but not engaged)
-- For every positive engagement, sample 5-10 random posts from same time period
```

**Pros:**
- ✅ Actually learns user preferences
- ✅ Trainable on CPU (minutes to hours, not days)
- ✅ Still deployable on Render

**Cons:**
- ⚠️ Need to collect training data first
- ⚠️ ~1-2s inference time (slower than Phase 1)

---

### Phase 3: Full Two-Stage Pipeline (Week 5-6)

**Goal:** Complete x-algorithm architecture with retrieval + ranking

**Architecture:**

```
Stage 1: Retrieval (Two-Tower Model)
─────────────────────────────────────
User History ──> User Tower ──> User Embedding (256-d)
                                          │
                                          ▼
All Posts ──> Candidate Tower ──> Post Embeddings (256-d)
                                          │
                                          ▼
                           Vector Similarity Search
                           (ANN: FAISS or pgvector)
                                          │
                                          ▼
                              Top 100 Candidates


Stage 2: Ranking (Fine-Tuned Transformer)
────────────────────────────────────────
User Context + Post ──> DistilBERT (frozen base)
                              │
                              ▼
                     Custom Input Embeddings (trained)
                              │
                              ▼
                     Classification Heads (trained)
                              │
                              ▼
              [P(like), P(reply), P(repost), ...]
                              │
                              ▼
                     Weighted Combination ──> Final Score
```

**Implementation:**

```python
class FullPipeline:
    def __init__(self):
        # Stage 1: Two-Tower Retrieval
        self.two_tower = TwoTowerModel()  # Phase 2 model
        
        # Stage 2: Transformer Ranker
        self.ranker = TransformerRanker()
        # Base: DistilBERT (frozen, 67M params)
        # Fine-tuned: Input projections + output heads (~2M params)
    
    async def get_recommendations(self, user_id: str):
        # 1. Encode user
        user_context = await self.get_user_context(user_id)
        user_embedding = self.two_tower.encode_user(user_context)
        
        # 2. Retrieve candidates using vector similarity
        candidates = await self.vector_search(user_embedding, k=100)
        
        # 3. Rank candidates with transformer
        scored = []
        for post in candidates:
            predictions = self.ranker.predict(user_context, post)
            final_score = self.weighted_score(predictions)
            scored.append((post, final_score))
        
        # 4. Apply diversity scorer
        scored = self.apply_diversity(scored)
        
        # 5. Return top 50
        return sorted(scored, key=lambda x: x[1], reverse=True)[:50]
```

**Training the Ranker:**

```python
class TransformerRanker(nn.Module):
    def __init__(self):
        # Pre-trained base (frozen)
        self.bert = AutoModel.from_pretrained('distilbert-base-uncased')
        for param in self.bert.parameters():
            param.requires_grad = False
        
        # Trainable components
        self.user_projection = nn.Linear(768, 256)
        self.post_projection = nn.Linear(768, 256)
        self.combined_projection = nn.Linear(512, 256)  # 256+256
        
        # Multi-task output heads
        self.heads = nn.ModuleDict({
            'like': nn.Linear(256, 1),
            'reply': nn.Linear(256, 1),
            'repost': nn.Linear(256, 1),
            'click': nn.Linear(256, 1),
            'share': nn.Linear(256, 1),
            # ... 12 total engagement types
        })
    
    def forward(self, user_text, post_text):
        # Encode with frozen BERT
        with torch.no_grad():
            user_repr = self.bert(**user_text).last_hidden_state[:, 0]
            post_repr = self.bert(**post_text).last_hidden_state[:, 0]
        
        # Trainable projections
        user_emb = self.user_projection(user_repr)
        post_emb = self.post_projection(post_repr)
        
        # Combine
        combined = torch.cat([user_emb, post_emb], dim=-1)
        features = self.combined_projection(combined)
        
        # Multi-task predictions
        return {action: head(features) for action, head in self.heads.items()}

# Training on engagement data
training_data = [
    {
        'user_history': "post1 post2 post3...",
        'candidate_post': "This is a new post...",
        'actions': {
            'like': 1,
            'reply': 0,
            'repost': 1,
            'click': 1,
            # ...
        }
    },
    # ... thousands of examples
]

# Multi-task loss
loss = sum(
    F.binary_cross_entropy_with_logits(
        predictions[action], 
        torch.tensor(label)
    )
    for action, label in example['actions'].items()
)
```

**Training Strategy:**

Since training this on CPU takes too long:

1. **Local/Colab Training:**
   - Train on laptop with GPU or Google Colab
   - Export just the trained head weights (~5MB)
   - Upload to Render

2. **Incremental Training:**
   - Start with pre-trained ranker (no training)
   - Collect engagement data for 1-2 weeks
   - Run overnight training job locally
   - Deploy updated weights

**Pros:**
- ✅ Complete x-algorithm architecture
- ✅ Actually learns engagement patterns
- ✅ Multi-task predictions (not just similarity)

**Cons:**
- ⚠️ 3-5s response time on Render CPU (acceptable for learning)
- ⚠️ Requires training infrastructure (even if offline)
- ⚠️ Need sufficient engagement data (thousands of events)

---

## Deployment Strategy

### Embedding Pre-Computation

Since encoding on every request is slow:

```sql
-- Store pre-computed embeddings in Supabase
ALTER TABLE posts ADD COLUMN embedding_384 VECTOR(384);
ALTER TABLE posts ADD COLUMN embedding_256 VECTOR(256); -- After projection

-- Compute on post creation
CREATE OR REPLACE FUNCTION compute_post_embedding()
RETURNS TRIGGER AS $$
BEGIN
    -- Trigger Python worker to compute embedding
    PERFORM pg_notify('compute_embedding', NEW.id::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_compute_embedding
    AFTER INSERT ON posts
    FOR EACH ROW EXECUTE FUNCTION compute_post_embedding();
```

### Python Embedding Worker

```python
# embedding_worker.py - Runs as background process

class EmbeddingWorker:
    def __init__(self):
        self.encoder = SentenceTransformer('all-MiniLM-L6-v2')
        self.supabase = create_client(...)
    
    async def listen_for_new_posts(self):
        # Listen to Supabase Realtime
        await self.supabase.realtime.listen('compute_embedding')
        
    async def process_new_post(self, post_id):
        post = await self.get_post(post_id)
        
        # Compute embedding
        embedding = self.encoder.encode(post.content)
        
        # Store back
        await self.supabase.table('posts').update({
            'embedding_384': embedding.tolist()
        }).eq('id', post_id).execute()
```

### Caching Strategy

```python
# Cache user embeddings (invalidate on new engagement)
user_embedding_cache = {}

async def get_user_embedding(user_id):
    if user_id in user_embedding_cache:
        return user_embedding_cache[user_id]
    
    # Compute fresh
    embedding = await compute_user_embedding(user_id)
    user_embedding_cache[user_id] = embedding
    return embedding

# Cache recommendation results (short TTL)
recommendation_cache = {}

async def get_cached_recommendations(user_id):
    cache_key = f"recs:{user_id}"
    if cache_key in recommendation_cache:
        return recommendation_cache[cache_key]
    
    recommendations = await compute_recommendations(user_id)
    recommendation_cache[cache_key] = recommendations
    return recommendations
```

---

## Implementation Phases Summary

| Phase | Timeline | Goal | Training Required | Deployable on Render |
|-------|----------|------|-------------------|---------------------|
| **1** | Week 1-2 | Pre-trained baseline | None | ✅ Yes |
| **2** | Week 3-4 | Two-Tower retrieval | Light (~200k params) | ✅ Yes |
| **3** | Week 5-6 | Full pipeline | Moderate (~2M params) | ⚠️ Slow but works |

---

## Key Learning Outcomes

By implementing this plan, you'll understand:

1. **Pipeline Architecture:** How recommendation systems work in stages
2. **Retrieval vs Ranking:** Why you need two-stage systems
3. **Embedding Learning:** How to train models on engagement data
4. **Fine-tuning:** Difference from training from scratch
5. **Personalization:** How one model serves all users personally
6. **Production Concerns:** Pre-computation, caching, offline training

---

## Next Steps

1. **Review this plan** and decide which phase to start with
2. **Set up Supabase schema** (posts with embedding columns, engagement_events table)
3. **Implement Phase 1** (pre-trained baseline)
4. **Start collecting engagement data** (even before Phase 2)
5. **Prepare training infrastructure** (local GPU or Colab for Phase 2/3)

---

## Questions for Implementation

Before proceeding:

1. **Phase Selection:** Do you want to:
   - Start with Phase 1 only (simplest, immediate results)
   - Skip to Phase 2 (learn personalization sooner)
   - Plan for full Phase 3 (most comprehensive learning)

2. **Training Infrastructure:**
   - Do you have access to a GPU locally?
   - Can you use Google Colab (free GPU)?
   - Or should we design CPU-only training (slower but works)?

3. **Timeline Priority:**
   - Fastest working solution (Phase 1)
   - Balance of learning + deployability (Phase 2)
   - Maximum architectural learning (Phase 3)

4. **Data Collection:**
   - Do you already track all 12 engagement types?
   - Or do you need to add instrumentation first?

---

*This plan clarifies the training vs fine-tuning distinction and provides a realistic path to learning the x-algorithm architecture on limited compute resources.*
