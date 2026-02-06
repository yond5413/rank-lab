# Online Learning Strategy for Two-Tower Retrieval Model

> How to train and update the two-tower model without traditional offline training cycles.

---

## Overview

This document outlines the online learning approach for our two-tower retrieval system. Unlike traditional batch training, we'll use incremental updates and pre-trained initialization to keep the system responsive and continuously improving.

**Key Principles:**
- ❌ No full model retraining from scratch
- ✅ Incremental embedding updates based on user interactions
- ✅ Cold-start handling via pre-trained post embeddings
- ✅ Continuous learning from engagement signals

---

## Model Components

### What Gets Trained/Learned

| Component | Architecture | Initialized | Learned Online |
|-----------|--------------|-------------|----------------|
| **User Tower** | Transformer | Random init | ✅ Yes - via engagement feedback |
| **Post Embeddings** | Lookup Table | Pre-trained MiniLM | ✅ Yes - fine-tuned online |
| **Author Embeddings** | Lookup Table | Random init | ✅ Yes - learned from scratch |
| **Action Embeddings** | Lookup Table | Random init | ✅ Yes - learned from scratch |
| **Candidate Tower MLP** | 2-layer MLP | Random init | ✅ Yes - updated online |
| **User Projection** | Linear(emb_size, 128) | Random init | ✅ Yes - learned online |

### What Stays Frozen

| Component | Frozen? | Reason |
|-----------|---------|--------|
| MiniLM Base Encoder | ✅ Yes | Pre-trained, no gradients needed |
| Post-to-Embedding Projection | ✅ Yes | One-time compute at post creation |

---

## Cold Start Strategy

### New Posts (Content Cold Start)

When a new post is created:

```python
# Step 1: Compute initial embedding using pre-trained MiniLM
def initialize_post_embedding(post_content: str) -> np.ndarray:
    # Use frozen MiniLM encoder
    base_embedding = minilm_encoder.encode(post_content)  # 384-dim
    
    # Project to 128-dim using pre-trained projection layer
    initial_embedding = candidate_projection(base_embedding)  # 128-dim
    
    # Store in embedding table
    store_post_embedding(post_id, initial_embedding, is_pretrained=True)
    
    return initial_embedding
```

**Cold Start Process:**
1. Post created → MiniLM encodes content → 384-dim embedding
2. Project to 128-dim using Candidate Tower's projection layer
3. Store in `post_embeddings` table
4. Mark as `is_pretrained=True` (not yet personalized)
5. As users engage, update embedding via online learning

### New Users (User Cold Start)

When a new user joins:

```python
def initialize_user_embedding(user_id: str) -> np.ndarray:
    # Start with zero vector (no history)
    initial_embedding = np.zeros(128)
    
    # Alternative: Use demographic/profile features if available
    if user_profile:
        initial_embedding = encode_profile_features(user_profile)
    
    store_user_embedding(user_id, initial_embedding, engagement_count=0)
    
    return initial_embedding
```

**New User Strategy:**
1. Start with zero or profile-based embedding
2. For first N interactions, rely on global popularity/recency
3. After N engagements, User Tower generates personalized embedding
4. Cold start period: ~10-20 engagements needed

---

## Online Learning Mechanism

### Signal Collection

**Positive Signals** (increase relevance):
- Like → Strong positive
- Reply → Very strong positive  
- Repost → Strong positive
- Click → Weak positive
- Dwell time > 5s → Implicit positive

**Negative Signals** (decrease relevance):
- Not interested → Strong negative
- Hide post → Weak negative
- Skip quickly (< 2s dwell) → Implicit negative
- Block/Mute author → Very strong negative

### Update Strategy

#### 1. Post Embedding Updates

When a user engages with a post:

```python
def update_post_embedding(post_id: str, user_embedding: np.ndarray, signal: float):
    """
    Update post embedding based on user interaction.
    
    Args:
        post_id: The post that was engaged with
        user_embedding: Current embedding of the engaging user (128-dim)
        signal: +1 for positive, -1 for negative, 0.5 for weak positive, etc.
    """
    current_embedding = get_post_embedding(post_id)
    
    # Move post embedding toward/away from user embedding
    learning_rate = 0.01  # Small updates for stability
    
    new_embedding = current_embedding + learning_rate * signal * user_embedding
    
    # Re-normalize (L2 norm = 1 for cosine similarity)
    new_embedding = new_embedding / np.linalg.norm(new_embedding)
    
    store_post_embedding(post_id, new_embedding)
```

**Update Logic:**
- Positive engagement: Move post embedding closer to user embedding
- Negative engagement: Move post embedding away from user embedding
- Learning rate: 0.001-0.01 (small to prevent drift)
- Normalize after each update (maintain unit sphere)

#### 2. User Embedding Updates

When user engages with content:

```python
def update_user_embedding(user_id: str, post_embedding: np.ndarray, signal: float):
    """
    Update user embedding based on engagement.
    
    User embedding = aggregate of recent positive interactions
    """
    current_embedding = get_user_embedding(user_id)
    engagement_count = get_engagement_count(user_id)
    
    # Moving average with decay
    alpha = min(0.1, 1.0 / (engagement_count + 1))  # Decay over time
    
    new_embedding = (1 - alpha) * current_embedding + alpha * signal * post_embedding
    
    # Re-normalize
    new_embedding = new_embedding / np.linalg.norm(new_embedding)
    
    store_user_embedding(user_id, new_embedding, engagement_count + 1)
```

**Update Logic:**
- User embedding = weighted average of engaged post embeddings
- More recent engagements weighted higher
- Normalize to unit sphere

#### 3. Candidate Tower MLP Updates

The Candidate Tower's MLP weights need batch updates:

```python
def update_candidate_tower_batch(engagement_pairs: List[Tuple]):
    """
    Periodically update MLP using recent engagement pairs.
    
    engagement_pairs: List of (user_emb, post_emb, post_content, label)
    """
    # Compute contrastive loss
    loss = 0
    for user_emb, post_emb, post_content, label in engagement_pairs:
        # Recompute post embedding from content
        base_emb = minilm_encoder.encode(post_content)
        predicted_emb = candidate_mlp(base_emb)
        
        # Loss: predicted should match actual if label=1, far if label=0
        similarity = cosine_similarity(user_emb, predicted_emb)
        target = 1.0 if label == 1 else -1.0
        loss += (similarity - target) ** 2
    
    # Gradient descent update
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    
    # Recompute all post embeddings with updated MLP
    refresh_post_embeddings()
```

**Update Frequency:**
- Run batch update every N engagements (e.g., every 1000 interactions)
- Use contrastive loss: positive pairs should be similar, negative pairs dissimilar
- Recompute all post embeddings after MLP update

#### 4. User Tower Transformer Updates

The User Tower is updated less frequently:

```python
def update_user_tower_batch(user_histories: List[UserHistory]):
    """
    Update transformer using user engagement sequences.
    
    user_histories: List of user engagement sequences with labels
    """
    # For each user, predict which post they'll engage with next
    for history in user_histories:
        user_emb = user_transformer(history.embeddings, history.mask)
        
        # Positive: post they engaged with
        # Negative: random post from same time period
        positive_emb = history.target_post_embedding
        negative_emb = sample_negative_post(history.timestamp)
        
        # Contrastive loss
        pos_sim = cosine_similarity(user_emb, positive_emb)
        neg_sim = cosine_similarity(user_emb, negative_emb)
        
        # Want: pos_sim >> neg_sim
        loss += max(0, margin - pos_sim + neg_sim)  # Triplet loss
    
    # Update transformer weights
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
```

**Update Frequency:**
- Every few hours or daily (heavier computation)
- Use triplet loss: user embedding closer to engaged post than random post
- Batch size: 32-128 users at a time

---

## Training Data Generation

### Positive Examples

A positive training pair is created when:
- User views post AND takes positive action (like, reply, repost)
- Record: `(user_id, post_id, user_embedding_at_time, post_embedding_at_time, label=1)`

```sql
-- Automatically create positive pairs
INSERT INTO training_pairs (user_id, post_id, user_emb, post_emb, label, created_at)
SELECT 
    e.user_id,
    e.post_id,
    (SELECT embedding FROM user_embeddings WHERE user_id = e.user_id) as user_emb,
    (SELECT embedding FROM post_embeddings WHERE post_id = e.post_id) as post_emb,
    TRUE as label,
    e.created_at
FROM engagement_events e
WHERE e.event_type IN ('like', 'reply', 'repost')
AND e.created_at > NOW() - INTERVAL '1 hour';  -- Recent only
```

### Negative Examples (Negative Sampling)

For every positive engagement, create 5-10 negative examples:

```python
def generate_negative_samples(positive_pair, num_negatives=5):
    """
    Generate negative samples for a positive engagement.
    Strategy: Posts the user saw but didn't engage with.
    """
    user_id = positive_pair.user_id
    timestamp = positive_pair.timestamp
    
    # Get posts user viewed around same time but didn't engage
    viewed_but_not_engaged = query_database("""
        SELECT post_id, post_emb
        FROM engagement_events
        WHERE user_id = %s
        AND event_type = 'view'
        AND created_at BETWEEN %s - INTERVAL '1 hour' AND %s
        AND post_id NOT IN (
            SELECT post_id FROM engagement_events
            WHERE user_id = %s
            AND event_type IN ('like', 'reply', 'repost')
        )
        ORDER BY RANDOM()
        LIMIT %s
    """, (user_id, timestamp, timestamp, user_id, num_negatives))
    
    negatives = []
    for post_id, post_emb in viewed_but_not_engaged:
        negatives.append({
            'user_id': user_id,
            'post_id': post_id,
            'user_emb': positive_pair.user_emb,
            'post_emb': post_emb,
            'label': 0
        })
    
    return negatives
```

---

## Update Schedule

### Real-Time Updates (Immediate)

| Component | Trigger | Latency |
|-----------|---------|---------|
| User embedding | Every engagement | < 10ms |
| Post embedding | Every engagement | < 10ms |
| Engagement log | Every view/click/like | < 10ms |

### Periodic Updates (Batch)

| Component | Frequency | Batch Size | Duration |
|-----------|-----------|------------|----------|
| Candidate Tower MLP | Every 1,000 engagements | 1,000 pairs | ~30 seconds |
| User Tower Transformer | Hourly | 128 users | ~2 minutes |
| Embedding refresh | Daily | All posts | ~5 minutes |

### Scheduled Maintenance

| Task | Frequency | Duration |
|------|-----------|----------|
| Full recompute of stale embeddings | Weekly | ~10 minutes |
| Archive old training data | Daily | < 1 minute |
| Embedding quality audit | Weekly | Manual review |

---

## Implementation Architecture

### Services

```
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                           │
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │ Inference API    │    │ Training Worker  │              │
│  │ - /recommend     │    │ (Background)     │              │
│  │ - /embed         │    │ - Batch updates  │              │
│  └────────┬─────────┘    └────────┬─────────┘              │
│           │                       │                         │
│           ▼                       ▼                         │
│  ┌────────────────────────────────────────────┐           │
│  │           Online Learning Module            │           │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────┐ │           │
│  │  │ Post Emb │ │ User Emb │ │ MLP Weights│ │           │
│  │  │ Updater  │ │ Updater  │ │   Updater  │ │           │
│  │  └──────────┘ └──────────┘ └────────────┘ │           │
│  └────────────────────────────────────────────┘           │
│                         │                                  │
└─────────────────────────┼──────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      Supabase                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ user_embeds  │ │ post_embeds  │ │ engagement_events    │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐                          │
│  │training_pairs│ │ model_weights│                          │
│  └──────────────┘ └──────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. User Engagement
   ├── Store engagement event
   ├── Update user embedding (real-time)
   ├── Update post embedding (real-time)
   └── Add to training batch

2. Batch Update (every N engagements)
   ├── Sample training pairs
   ├── Update Candidate Tower MLP
   ├── Refresh post embeddings
   └── Store updated weights

3. Transformer Update (hourly)
   ├── Sample user histories
   ├── Compute triplet loss
   ├── Update User Tower
   └── Store updated weights
```

---

## Monitoring & Quality

### Metrics to Track

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Embedding update latency | < 10ms | > 50ms |
| Training pair generation rate | > 100/hour | < 10/hour |
| Positive/Negative ratio | 1:5 to 1:10 | < 1:3 or > 1:20 |
| Embedding drift (cosine distance) | < 0.1/day | > 0.3/day |
| Cold start post CTR | > 1% | < 0.5% |
| User embedding coverage | > 90% | < 70% |

### Quality Checks

```python
def audit_embedding_quality():
    """Run weekly quality audit."""
    
    # 1. Check for embedding drift
    old_embeddings = load_embeddings(timestamp='1 week ago')
    new_embeddings = load_embeddings(timestamp='now')
    
    drift = cosine_similarity(old_embeddings, new_embeddings).mean()
    if drift < 0.9:
        alert("High embedding drift detected!")
    
    # 2. Check training data balance
    pos_count = count_training_pairs(label=1)
    neg_count = count_training_pairs(label=0)
    ratio = pos_count / neg_count
    
    if not (0.1 <= ratio <= 0.5):
        alert(f"Imbalanced training data: {ratio}")
    
    # 3. Check cold start coverage
    cold_start_posts = count_posts(age='< 24 hours')
    with_embeddings = count_posts_with_embeddings(age='< 24 hours')
    coverage = with_embeddings / cold_start_posts
    
    if coverage < 0.9:
        alert(f"Low cold start coverage: {coverage}")
```

---

## Fallback Strategies

### If Online Learning Fails

1. **Revert to Pre-trained Embeddings**: Use MiniLM embeddings without personalization
2. **Global Popularity**: Fall back to engagement count ranking
3. **Recency Bias**: Show most recent posts from followed accounts

### If Embedding Drift Detected

1. Freeze all updates
2. Revert to last known good checkpoint
3. Investigate cause (bad data, spam, etc.)
4. Resume with lower learning rate

---

## Summary

| Aspect | Approach |
|--------|----------|
| **Initialization** | Pre-trained MiniLM for posts, random for users |
| **Updates** | Real-time for embeddings, batch for model weights |
| **Positive Signal** | Like, reply, repost, long dwell |
| **Negative Signal** | Not interested, skip, block |
| **Loss Function** | Contrastive + Triplet loss |
| **Learning Rate** | 0.001-0.01 (small, stable) |
| **Normalization** | L2 after every update |
| **Cold Start** | MiniLM initialization, 10-20 engagements to personalize |
| **Update Frequency** | Real-time for embeddings, hourly for models |

---

## Next Steps

1. **Database Schema**: Create embedding tables and training_pairs table
2. **Embedding Service**: Build real-time embedding update API
3. **Training Worker**: Implement batch update jobs
4. **Monitoring**: Set up quality metrics and alerts
5. **A/B Test**: Compare online learning vs static embeddings

---

*This strategy prioritizes stability and continuous improvement over aggressive optimization. Small, frequent updates prevent model drift while keeping the system responsive.*
