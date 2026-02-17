# Reranking Algorithm Architecture - Demo Reference

This document provides a comprehensive overview of the reranking system with detailed notes and file references for demo presentations.

---

## Main Architecture Overview

```mermaid
flowchart TB
    subgraph Input["📥 1. Input Layer
    File: recommendations.py:22-44"]
        User["User Request
    POST /api/v1/recommend
    Body: {user_id, limit}"]
    end

    subgraph Hydration["💧 2. Query Hydration
    File: pipeline.py:28-140"]
        UserEmb["User Embedding
    128-dim vector
    Table: user_embeddings"]
        Following["Following List
    From: follows table"]
        Blocked["Blocked Authors
    From: blocks table"]
        Muted["Muted Authors
    From: mutes table"]
        History["Engagement History
    Last 50 events
    Table: engagement_events"]
    end

    subgraph Sourcing["🔍 3. Candidate Sourcing
    File: pipeline.py:142-234"]
        InNetwork["In-Network Pool
    'Thunder' Strategy
    Recent posts from followed users
    Limit: 300"]
        OON["Out-of-Network Pool
    'Phoenix' Strategy
    Similarity-based retrieval"]
        TwoTower["Two-Tower Similarity
    cos(user_emb, post_emb)
    File: two_tower.py:157-161"]
    end

    subgraph Filters["🚫 4. Pre-Scoring Filters
    File: filters.py:120-158"]
        FilterPipeline["FilterPipeline
    Sequential filtering"]
        DupFilter["Drop Duplicates
    Remove duplicate post IDs"]
        CoreFilter["Core Data Hydration
    Remove posts missing metadata"]
        AgeFilter["Age Filter
    Remove posts >7 days old"]
        SelfFilter["Self Tweet Filter
    Remove user's own posts"]
        SocialFilter["Author Socialgraph
    Remove blocked/muted authors"]
    end

    subgraph Ranking["🤖 5. MiniLM Ranking
    File: minilm_ranker.py:44-190"]
        MiniLM["MiniLM-L6-v2
    Sentence Transformer
    Frozen weights
    384-dim output"]
        UserCtx["User Context
    Engagement history text"]
        PostEmb["Post Embeddings
    Batch encoded
    Shape: N×384"]
        ActionHead["Action Prediction Head
    Input: 768-dim (user+post)
    File: minilm_ranker.py:12-42"]
        Probs["Action Probabilities
    6 actions per candidate"]
    end

    subgraph Scoring["📊 6. Multi-Stage Scoring
    File: scoring.py:107-129"]
        Weighted["Stage 1: Weighted Scorer
    Formula: Σ(weight × P(action))
    File: scoring.py:10-44"]
        Diversity["Stage 2: Author Diversity
    Penalty: multiplier = 0.3 + 0.7^position
    Prevents single author dominance
    File: scoring.py:46-82"]
        OONWeight["Stage 3: OON Weight
    Factor: 0.8
    Slight preference for in-network
    File: scoring.py:84-105"]
    end

    subgraph Output["📤 7. Output Layer
    File: pipeline.py:327-352"]
        TopK["Top-K Selection
    Default: 30 posts"]
        Response["RecommendationResponse
    posts[], scores[]
    total_candidates
    processing_time_ms"]
    end

    User --> Hydration
    
    Hydration --> Sourcing
    UserEmb --> TwoTower
    Following --> InNetwork
    TwoTower --> OON
    
    InNetwork --> Filters
    OON --> Filters
    Blocked --> SocialFilter
    Muted --> SocialFilter
    
    Filters --> Ranking
    History --> UserCtx
    UserCtx --> MiniLM
    MiniLM --> PostEmb
    PostEmb --> ActionHead
    UserEmb -.-> ActionHead
    ActionHead --> Probs
    
    Probs --> Scoring
    Weighted --> Diversity
    Diversity --> OONWeight
    
    Scoring --> TopK
    TopK --> Response

    style Input fill:#e8f5e9
    style Hydration fill:#e3f2fd
    style Sourcing fill:#fff3e0
    style Filters fill:#ffebee
    style Ranking fill:#f3e5f5
    style Scoring fill:#e0f2f1
    style Output fill:#e8f5e9
```

---

## Detailed Component Breakdown

### 1. Input Layer

**File:** `backend/app/api/recommendations.py:22-44`

```python
@router.post("/recommend", response_model=RecommendationResponse)
async def get_recommendations(request: RecommendationRequest):
    """
    Pipeline:
    1. Query Hydration (user embedding + following list)
    2. Candidate Sourcing (in-network + out-of-network)
    3. Pre-Scoring Filters
    4. MiniLM Ranking
    5. Weighted Scoring
    6. Top-K Selection
    """
```

**Key Points for Demo:**
- Single endpoint for all recommendations
- Returns `RecommendationResponse` with posts, scores, and metadata
- Processing time tracked for performance monitoring

---

### 2. Query Hydration

**File:** `backend/app/services/pipeline.py:28-140`

**Parallel Data Fetching:**
```python
# All 3 queries run concurrently using asyncio.gather
user_embedding, following, (blocked, muted) = await asyncio.gather(
    self.get_user_embedding(user_id),      # From user_embeddings table
    self.get_following_list(user_id),      # From follows table
    self.get_blocked_muted_authors(user_id) # From blocks/mutes tables
)
```

**Caching Strategy:**
- User embeddings: 5-minute Redis cache
- Following lists: 5-minute Redis cache
- Blocked/muted: 5-minute Redis cache

**Tables Accessed:**
- `user_embeddings` - 128-dim user vector
- `follows` - User's following relationships
- `blocks` - Blocked authors
- `mutes` - Muted authors

---

### 3. Candidate Sourcing (Dual Pool Strategy)

**File:** `backend/app/services/pipeline.py:142-234`

#### In-Network Pool ("Thunder")

```python
async def fetch_in_network_candidates(
    self, following: List[UUID], limit: int = 300
) -> List[PostCandidate]:
    # Fetch recent posts from followed users
    # Only top-level posts (not replies)
    # Ordered by created_at DESC
```

**Characteristics:**
- Source: Posts from followed users only
- Strategy: Recent first (chronological)
- Max Results: 300 (configurable via `THUNDER_MAX_RESULTS`)
- No ML scoring at this stage

#### Out-of-Network Pool ("Phoenix")

```python
async def fetch_out_of_network_candidates(
    self, user_embedding: np.ndarray, limit: int = 300
) -> List[PostCandidate]:
    # Two-tower similarity computation
    similarities = []
    for post_emb in post_embeddings:
        similarity = np.dot(user_embedding, post_emb)  # Cosine similarity
        similarities.append((post_id, similarity))
    
    # Sort by similarity and take top-K
    similarities.sort(key=lambda x: x[1], reverse=True)
```

**Two-Tower Similarity:**
- **File:** `backend/app/services/two_tower.py:157-161`
- Dot product = Cosine similarity (since vectors are L2 normalized)
- Top 500 posts considered for similarity computation

---

### 4. Pre-Scoring Filters

**File:** `backend/app/services/filters.py`

**Filter Pipeline Order:**

```mermaid
flowchart LR
    Input["~600 Candidates
Thunder + Phoenix"] --> Dup["1. Drop Duplicates
Remove same post IDs"]
    Dup --> Core["2. Core Data Hydration
Remove missing metadata"]
    Core --> Age["3. Age Filter
Remove >7 days old"]
    Age --> Self["4. Self Tweet Filter
Remove own posts"]
    Self --> Social["5. Author Socialgraph
Remove blocked/muted"]
    Social --> Output["Filtered Candidates"]
```

**Implementation:**
```python
class FilterPipeline:
    def __init__(self, user_id, blocked_authors, muted_authors):
        self.filters = [
            DropDuplicatesFilter(),           # Remove duplicate IDs
            CoreDataHydrationFilter(),        # Require text + author + date
            AgeFilter(max_age_days=7),        # Recent content only
            SelfTweetFilter(user_id),         # Don't show own posts
            AuthorSocialgraphFilter(blocked, muted)  # Respect user preferences
        ]
```

**Returns:** `(filtered_candidates, filter_stats)`
- Stats show how many removed by each filter
- Useful for debugging and monitoring

---

### 5. MiniLM Ranking (Action Prediction)

**File:** `backend/app/services/minilm_ranker.py`

#### Architecture Overview

```mermaid
flowchart TB
    subgraph UserBranch["User Encoding"]
        U1["User Context Text
(Engagement History)"] --> U2["MiniLM Tokenizer"] 
        U2 --> U3["MiniLM-L6-v2
Frozen Weights"]
        U3 --> U4["Mean Pooling"]
        U4 --> UE["User Embedding
384-dim"]
    end
    
    subgraph PostBranch["Post Encoding (Batch)"]
        P1["Candidate Posts
Text Array"] --> P2
