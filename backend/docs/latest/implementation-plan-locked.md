# Implementation Plan - Locked

> Final architecture decisions for the Rank Lab recommendation system.

---

## Architecture Overview

### Two-Tower Retrieval + MiniLM Ranker Pipeline

```
User Request
    │
    ▼
┌─────────────────────────────────────────────┐
│ 1. Query Hydration                           │
│    - Fetch user engagement history           │
│    - Fetch following list                    │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ 2. Candidate Sourcing (Parallel)             │
│                                              │
│  ┌─────────────────┐  ┌─────────────────┐   │
│  │ In-Network      │  │ Out-of-Network  │   │
│  │ (Supabase)      │  │ (Two-Tower)     │   │
│  │ - 300 posts     │  │ - 300 posts     │   │
│  └─────────────────┘  └─────────────────┘   │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ 3. Candidate Hydration (Parallel)            │
│    - Core data from Supabase                 │
│    - In-network flag                         │
│    - Author info                             │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ 4. Pre-Scoring Filters (Sequential)          │
│    1. DropDuplicatesFilter                   │
│    2. CoreDataHydrationFilter                │
│    3. AgeFilter                              │
│    4. SelfTweetFilter                        │
│    5. AuthorSocialgraphFilter                │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ 5. Scoring (Sequential)                      │
│                                              │
│  ┌─────────────────────────────────────┐    │
│  │ PhoenixScorer (MiniLM Ranker)       │    │
│  │ - Pre-trained (frozen weights)      │    │
│  │ - 6 action predictions:             │    │
│  │   * Like (positive)                 │    │
│  │   * Reply (positive)                │    │
│  │   * Repost (positive)               │    │
│  │   * Not_interested (negative)       │    │
│  │   * Block_author (negative)         │    │
│  │   * Mute_author (negative)          │    │
│  │ - Candidate isolation masking       │    │
│  └──────────────────┬──────────────────┘    │
                     │
                     ▼
  ┌─────────────────────────────────────┐
  │ WeightedScorer                      │
  │ - Weights from database             │
  │ - Adjustable via admin portal       │
  │ - Formula: Σ(weight × probability)  │
  └─────────────────────────────────────┘

                   │
                   ▼
┌─────────────────────────────────────────────┐
│ 6. Selection                                 │
│    - TopKScoreSelector (k=30)                │
└─────────────────────────────────────────────┘
```

---

## Component Specifications

### Two-Tower Retrieval

**User Tower:**
- Architecture: Transformer
- Input: User engagement history (last 50 interactions)
- Output: 128-dim user embedding
- Sequence processing: Variable length with padding mask

**Candidate Tower:**
- Architecture: 2-layer MLP with SiLU activation
- Input: Post embedding (128-dim)
- Output: 128-dim candidate embedding
- All posts pre-computed and stored

**Retrieval:**
- Similarity: Dot product
- Top-K: 300 out-of-network candidates
- Combined with 300 in-network = 600 total candidates

### MiniLM Ranker

**Model:**
- Base: `sentence-transformers/all-MiniLM-L6-v2` (HuggingFace)
- State: Pre-trained, frozen weights
- No training or fine-tuning required

**Architecture:**
- Input: User context + candidate post content
- Attention: Candidate isolation masking implemented
- Output head: 6 classification outputs
- Output: Probabilities for each action type

**Candidate Isolation:**
- Candidates can attend to user history
- Candidates can attend to themselves
- Candidates CANNOT attend to other candidates
- Implemented via custom attention mask
- **Verification**: TODO - Add to admin portal logging

**Action Predictions (6 total):**

| Action | Type | Standard Weight | Description |
|--------|------|-----------------|-------------|
| like | Positive | 1.0 | User likes the post |
| reply | Positive | 1.2 | User replies to post |
| repost | Positive | 1.0 | User reposts/retweets |
| not_interested | Negative | -2.0 | User marks not interested |
| block_author | Negative | -10.0 | User blocks author |
| mute_author | Negative | -5.0 | User mutes author |

**Skipped Actions (not implemented):**
- video_view, photo_expand, share, dwell, follow_author, profile_click, click, quote

### WeightedScorer

**Formula:**
```
final_score = Σ(weight_i × P(action_i))
```

**Weight Management:**
- Stored in `scoring_weights` database table
- Adjustable via admin portal in real-time
- Standard weights provided as defaults
- No restart required when weights change

**Database Schema:**
```sql
CREATE TABLE scoring_weights (
    action_type VARCHAR(50) PRIMARY KEY,
    weight FLOAT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Filters (5 Essential Only)

**Pre-Scoring Filters (in order):**

1. **DropDuplicatesFilter**
   - Remove duplicate post IDs
   - Essential: Yes

2. **CoreDataHydrationFilter**
   - Remove posts missing core metadata
   - Essential: Yes

3. **AgeFilter**
   - Remove posts older than threshold (e.g., 7 days)
   - Essential: Yes

4. **SelfTweetFilter**
   - Remove user's own posts
   - Essential: Yes

5. **AuthorSocialgraphFilter**
   - Remove posts from blocked/muted authors
   - Essential: Yes

**Skipped Filters (for MVP):**
- RetweetDeduplicationFilter
- IneligibleSubscriptionFilter
- PreviouslySeenPostsFilter
- PreviouslyServedPostsFilter
- MutedKeywordFilter
- DedupConversationFilter

---

## Database Schema

### Required Tables

```sql
-- User embeddings (updated online)
CREATE TABLE user_embeddings (
    user_id UUID PRIMARY KEY REFERENCES profiles(id),
    embedding_128 TEXT NOT NULL,  -- JSON array of 128 floats
    engagement_count INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Post embeddings (pre-computed)
CREATE TABLE post_embeddings (
    post_id UUID PRIMARY KEY REFERENCES posts(id),
    embedding_128 TEXT NOT NULL,  -- JSON array of 128 floats
    base_embedding_384 TEXT,      -- MiniLM base embedding (optional)
    is_pretrained BOOLEAN DEFAULT TRUE,
    computed_at TIMESTAMP DEFAULT NOW()
);

-- Scoring weights (admin adjustable)
CREATE TABLE scoring_weights (
    action_type VARCHAR(50) PRIMARY KEY,
    weight FLOAT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Attention masking verification logs (TODO)
CREATE TABLE attention_verification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES posts(id),
    batch_1_score FLOAT,
    batch_2_score FLOAT,
    score_diff FLOAT,
    test_timestamp TIMESTAMP DEFAULT NOW()
);

-- Engagement events (for tracking)
CREATE TABLE engagement_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id),
    post_id UUID NOT NULL REFERENCES posts(id),
    event_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Admin Portal Features (TODO)

### 1. Weight Management Panel
- View current scoring weights
- Adjust weights in real-time
- See weight change history
- Reset to defaults

### 2. Attention Masking Verification
- Test: Score same post in different candidate batches
- Verify: Score should remain consistent (within epsilon)
- Log: Track any inconsistencies
- Alert: Notify if masking not working properly

### 3. Embedding Monitoring
- View user embedding distribution
- View post embedding distribution
- Check for embedding drift
- Cold start monitoring

---

## Key Decisions

### ✅ What We're Doing
- Pre-trained MiniLM from HuggingFace (no training)
- 6 action predictions (positive + negative)
- Candidate isolation attention masking
- Adjustable weights from database
- 5 essential filters only
- 600 candidates → 30 final posts
- All external services replaced with Supabase

### ❌ What We're NOT Doing
- No model training or fine-tuning
- No 16 action predictions (reduced to 6)
- No complex filters (retweet dedup, subscriptions, etc.)
- No external dependencies (TES, Gizmoduck, Strato)
- No Thunder in-memory store (query Supabase directly)
- No video duration or subscription features

---

## Implementation Phases

### Phase 1: Core Retrieval
- Database migrations
- Two-Tower implementation
- Basic filters
- Similarity-only scoring

### Phase 2: Add MiniLM Ranker
- HuggingFace integration
- 6-action prediction head
- Candidate isolation masking
- WeightedScorer with database weights

### Phase 3: Admin Portal
- Weight management UI
- Attention verification logging
- Monitoring dashboards

---

## Technical Notes

### Model Loading
```python
from transformers import AutoModel, AutoTokenizer

# Load pre-trained MiniLM
model = AutoModel.from_pretrained("sentence-transformers/all-MiniLM-L6-v2")
model.eval()  # Freeze weights

# Add classification head for 6 actions
# (Implemented as separate layer, not part of pre-trained model)
```

### Attention Mask Implementation
```python
def make_candidate_isolation_mask(seq_len, candidate_start_idx):
    """
    Create attention mask where:
    - User history positions: causal attention
    - Candidate positions: can see user history + themselves
    - Candidate positions: CANNOT see other candidates
    """
    mask = torch.ones(seq_len, seq_len)
    
    # Zero out candidate-to-candidate (except self)
    for i in range(candidate_start_idx, seq_len):
        for j in range(candidate_start_idx, seq_len):
            if i != j:
                mask[i, j] = 0
    
    return mask
```

### Weighted Score Calculation
```python
def compute_weighted_score(predictions: Dict[str, float], weights: Dict[str, float]) -> float:
    """
    predictions: {"like": 0.8, "reply": 0.3, "not_interested": 0.1, ...}
    weights: {"like": 1.0, "reply": 1.2, "not_interested": -2.0, ...}
    """
    score = sum(
        weights.get(action, 0.0) * prob
        for action, prob in predictions.items()
    )
    return score
```

---

## Dependencies

**Core:**
- FastAPI
- Supabase (PostgreSQL)
- PyTorch
- Transformers (HuggingFace)
- NumPy

**Model:**
- `sentence-transformers/all-MiniLM-L6-v2` (HuggingFace)
- ~22M parameters
- Runs on CPU

---

## Performance Targets

- **Query Hydration**: < 50ms
- **Two-Tower Retrieval**: < 100ms
- **MiniLM Ranking (600 candidates)**: < 500ms
- **Total Pipeline**: < 1 second
- **Throughput**: 100+ requests/minute on Render

---

## Verification Checklist

- [ ] Two-Tower retrieval returns candidates
- [ ] User embeddings update on engagement
- [ ] Post embeddings pre-computed correctly
- [ ] MiniLM loads and runs without training
- [ ] 6 action predictions generated
- [ ] Attention masking implemented
- [ ] WeightedScorer reads from database
- [ ] Admin portal can adjust weights
- [ ] Attention verification logging works
- [ ] End-to-end pipeline returns ranked feed

---

*Last updated: 2026-02-04*
*Status: Locked for implementation*
