# Rank Lab Recommendation System

> Adapting the [xai-org/x-algorithm](https://github.com/xai-org/x-algorithm) for a smaller-scale social feed recommendation service.

## Table of Contents

- [Project Overview](#project-overview)
- [Current Stack](#current-stack)
- [x-algorithm Architecture Reference](#x-algorithm-architecture-reference)
- [Adaptation Strategy](#adaptation-strategy)
- [Smaller Transformer Options](#smaller-transformer-options)
- [Proposed FastAPI Backend Structure](#proposed-fastapi-backend-structure)
- [Key Code Components](#key-code-components)
- [Weighted Scoring Formula](#weighted-scoring-formula)
- [Database Integration](#database-integration)
- [Next Steps](#next-steps)

---

## Project Overview

This project aims to implement a personalized "For You" feed recommendation system inspired by X's open-source algorithm. The goal is to:

1. Replace the large Grok-based transformer with a smaller, more efficient model
2. Build a FastAPI backend that integrates with our existing Supabase database
3. Implement the core pipeline stages: sourcing, filtering, scoring, and selection
4. Provide ranked post recommendations based on user engagement history

---

## Current Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js with TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Backend | FastAPI (to be implemented) |

### Existing Database Schema

```
profiles
├── id (uuid, PK)
├── username (text, unique)
├── display_name (text)
├── avatar_url (text)
├── bio (text)
├── followers_count (integer)
└── following_count (integer)

posts
├── id (uuid, PK)
├── author_id (uuid, FK → profiles)
├── content (text, max 280 chars)
├── parent_id (uuid, FK → posts, for replies)
├── likes_count (integer)
├── reply_count (integer)
├── repost_count (integer)
└── view_count (integer)

likes
├── id (uuid, PK)
├── post_id (uuid, FK → posts)
├── user_id (uuid, FK → profiles)
└── created_at (timestamp)

follows
├── id (uuid, PK)
├── follower_id (uuid, FK → profiles)
├── following_id (uuid, FK → profiles)
└── created_at (timestamp)
```

---

## x-algorithm Architecture Reference

The original x-algorithm consists of four main components:

### 1. Home Mixer (Orchestration Layer)

The orchestration layer that assembles the For You feed using a pipeline framework:

| Stage | Description |
|-------|-------------|
| Query Hydrators | Fetch user context (engagement history, following list) |
| Sources | Retrieve candidates from Thunder and Phoenix |
| Hydrators | Enrich candidates with additional data |
| Filters | Remove ineligible candidates |
| Scorers | Predict engagement and compute final scores |
| Selector | Sort by score and select top K |
| Post-Selection Filters | Final visibility and dedup checks |

### 2. Thunder (In-Network Content)

An in-memory post store that:
- Tracks recent posts from all users
- Serves posts from accounts the user follows
- Enables sub-millisecond lookups

### 3. Phoenix (ML Component)

Two main functions:

**Retrieval (Two-Tower Model):**
- User Tower: Encodes user features into an embedding
- Candidate Tower: Encodes posts into embeddings
- Similarity Search: Retrieves top-K posts via dot product

**Ranking (Transformer):**
- Takes user context and candidate posts as input
- Uses candidate isolation (candidates can't attend to each other)
- Outputs engagement probabilities for each action type

### 4. Candidate Pipeline (Framework)

Reusable traits for building recommendation pipelines:
- `Source` - Fetch candidates
- `Hydrator` - Enrich with features
- `Filter` - Remove ineligible candidates
- `Scorer` - Compute ranking scores
- `Selector` - Sort and select top K

---

## Adaptation Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                      Next.js Frontend                            │
│                        (Feed Component)                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP Request
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend                             │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Recommendation Pipeline                 │    │
│  │                                                          │    │
│  │   Sources ──▶ Hydrators ──▶ Filters ──▶ Scorers ──▶ Selector │
│  │      │                                      │                 │
│  │      ▼                                      ▼                 │
│  │   Supabase                          Transformer Model         │
│  │   (posts, follows)                  (MiniLM/DistilBERT)      │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Supabase                                 │
│     profiles │ posts │ likes │ follows                          │
└─────────────────────────────────────────────────────────────────┘
```

### Key Simplifications

1. **No Thunder equivalent** - Query Supabase directly for in-network posts
2. **Simplified retrieval** - Use embedding similarity for out-of-network discovery
3. **Smaller transformer** - Replace Grok with MiniLM or DistilBERT
4. **Single service** - FastAPI handles all pipeline stages

---

## Smaller Transformer Options

| Model | Parameters | Speed | Quality | Use Case |
|-------|------------|-------|---------|----------|
| `all-MiniLM-L6-v2` | 22M | Very Fast | Good | Lightweight ranking |
| `all-MiniLM-L12-v2` | 33M | Fast | Better | Balanced |
| `distilbert-base-uncased` | 67M | Medium | Good | General purpose |
| `all-mpnet-base-v2` | 110M | Slower | Best | High quality ranking |
| `paraphrase-MiniLM-L6-v2` | 22M | Very Fast | Good | Semantic similarity |

**Recommendation:** Start with `all-MiniLM-L6-v2` for development, upgrade to `all-mpnet-base-v2` for production if needed.

---

## Proposed FastAPI Backend Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI entry point
│   ├── config.py                  # Configuration settings
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── post.py                # Post data models
│   │   ├── user.py                # User context models
│   │   └── recommendation.py      # Request/response models
│   │
│   ├── pipeline/
│   │   ├── __init__.py
│   │   ├── sources.py             # In-network & out-of-network sources
│   │   ├── hydrators.py           # Data enrichment
│   │   ├── filters.py             # Pre/post scoring filters
│   │   ├── scorers.py             # ML scoring (WeightedScorer)
│   │   └── selector.py            # Top-K selection
│   │
│   ├── ml/
│   │   ├── __init__.py
│   │   ├── transformer.py         # Transformer model wrapper
│   │   ├── retrieval.py           # Two-tower retrieval (optional)
│   │   └── embeddings.py          # Embedding utilities
│   │
│   ├── database/
│   │   ├── __init__.py
│   │   └── supabase_client.py     # Supabase client
│   │
│   └── api/
│       ├── __init__.py
│       └── recommendations.py     # API endpoints
│
├── requirements.txt
├── .env.example
└── README.md
```

---

## Key Code Components

### 1. FastAPI Main Application

```python
# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.recommendations import router as recommendations_router

app = FastAPI(
    title="Rank Lab Recommendation API",
    description="Personalized feed recommendations",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(recommendations_router, prefix="/api/v1", tags=["recommendations"])

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
```

### 2. Transformer Model Wrapper

```python
# app/ml/transformer.py
from transformers import AutoTokenizer, AutoModel
import torch
import numpy as np
from typing import Dict, List

class TransformerScorer:
    """Smaller transformer model replacing Grok"""
    
    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModel.from_pretrained(model_name).to(self.device)
        self.model.eval()
    
    def encode(self, text: str) -> np.ndarray:
        """Encode text to embedding"""
        inputs = self.tokenizer(
            text, 
            return_tensors="pt", 
            truncation=True, 
            max_length=512,
            padding=True
        )
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        
        with torch.no_grad():
            outputs = self.model(**inputs)
            # Mean pooling
            attention_mask = inputs['attention_mask']
            token_embeddings = outputs.last_hidden_state
            input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
            embedding = torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        
        return embedding.cpu().numpy()[0]
    
    def similarity(self, embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """Compute cosine similarity"""
        return float(np.dot(embedding1, embedding2) / (np.linalg.norm(embedding1) * np.linalg.norm(embedding2)))
```

### 3. Phoenix Scorer (Simplified)

```python
# app/pipeline/scorers.py
from typing import List, Dict
from app.models.post import PostCandidate
from app.models.user import UserContext
from app.ml.transformer import TransformerScorer

class PhoenixScorer:
    """Predicts engagement probabilities using transformer embeddings"""
    
    def __init__(self):
        self.model = TransformerScorer()
    
    async def score(self, user_context: UserContext, posts: List[PostCandidate]) -> List[Dict]:
        # Build user profile from engagement history
        user_text = self._build_user_profile(user_context)
        user_embedding = self.model.encode(user_text)
        
        scores = []
        for post in posts:
            post_embedding = self.model.encode(post.content)
            similarity = self.model.similarity(user_embedding, post_embedding)
            
            # Map similarity to engagement probabilities
            predictions = self._predict_engagements(similarity, post)
            
            scores.append({
                "post_id": post.id,
                "predictions": predictions,
            })
        
        return scores
    
    def _build_user_profile(self, ctx: UserContext) -> str:
        """Combine recent liked/engaged posts into user profile"""
        liked_contents = [e.content for e in ctx.recent_likes[:10]]
        return " ".join(liked_contents) if liked_contents else ""
    
    def _predict_engagements(self, similarity: float, post: PostCandidate) -> Dict[str, float]:
        """Map similarity to engagement probabilities"""
        # Base predictions from content similarity
        base = max(0, min(1, (similarity + 1) / 2))  # Normalize to [0, 1]
        
        return {
            "favorite": base * 0.4,
            "reply": base * 0.2,
            "repost": base * 0.15,
            "click": base * 0.5,
            "not_interested": (1 - base) * 0.1,
            "block_author": (1 - base) * 0.02,
            "mute_author": (1 - base) * 0.02,
        }
```

---

## Weighted Scoring Formula

Based on the x-algorithm's `WeightedScorer`, the final score is computed as:

```
final_score = Σ (weight_i × P(action_i))
```

The `WeightedScorer` calculates a combined score by multiplying each predicted engagement probability by a predefined weight and summing these products. This combined score is then used to rank posts.

### Engagement Types and Weights

**Positive Actions (from x-algorithm):**

| Engagement | Weight Parameter | Description |
|------------|------------------|-------------|
| `favorite_score` | `FAVORITE_WEIGHT` | User likes the post |
| `reply_score` | `REPLY_WEIGHT` | User replies to the post |
| `retweet_score` | `RETWEET_WEIGHT` | User reposts |
| `click_score` | `CLICK_WEIGHT` | User clicks to expand |
| `profile_click_score` | `PROFILE_CLICK_WEIGHT` | User clicks author profile |
| `share_score` | `SHARE_WEIGHT` | User shares externally |
| `share_via_dm_score` | `SHARE_VIA_DM_WEIGHT` | User shares via DM |
| `share_via_copy_link_score` | `SHARE_VIA_COPY_LINK_WEIGHT` | User copies link |
| `dwell_score` | `DWELL_WEIGHT` | User spends time viewing |
| `quote_score` | `QUOTE_WEIGHT` | User quotes the post |
| `follow_author_score` | `FOLLOW_AUTHOR_WEIGHT` | User follows the author |
| `vqv_score` | `VQV_WEIGHT` | Video quality view (conditional on duration) |

**Negative Actions (from x-algorithm):**

| Engagement | Weight Parameter | Description |
|------------|------------------|-------------|
| `not_interested_score` | `NOT_INTERESTED_WEIGHT` | User marks not interested |
| `block_author_score` | `BLOCK_AUTHOR_WEIGHT` | User blocks author |
| `mute_author_score` | `MUTE_AUTHOR_WEIGHT` | User mutes author |
| `report_score` | `REPORT_WEIGHT` | User reports the post |

### Our Simplified Implementation

```python
# app/pipeline/scorers.py

class WeightedScorer:
    """Combines engagement predictions into final score"""
    
    # Configurable weights (tune based on your data)
    WEIGHTS = {
        # High-value positive signals
        "favorite": 1.0,
        "repost": 1.2,
        "reply": 0.8,
        "quote": 0.9,
        "share": 1.0,
        
        # Medium-value positive signals  
        "click": 0.3,
        "profile_click": 0.4,
        "follow_author": 1.5,
        "dwell": 0.2,
        
        # Negative signals (push content down)
        "not_interested": -2.0,
        "block_author": -10.0,
        "mute_author": -5.0,
        "report": -15.0,
    }
    
    def compute_weighted_score(self, predictions: Dict[str, float]) -> float:
        """Compute final weighted score from predictions"""
        score = sum(
            self.WEIGHTS.get(action, 0.0) * prob
            for action, prob in predictions.items()
        )
        return score
```

### Scoring Pipeline Flow

```
PostCandidate
     │
     ▼
┌─────────────────┐
│  PhoenixScorer  │  ──▶  Predicts P(favorite), P(reply), P(repost), etc.
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ WeightedScorer  │  ──▶  final_score = Σ(weight × probability)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AuthorDiversity │  ──▶  Attenuate repeated authors (optional)
└────────┬────────┘
         │
         ▼
    Final Score
```

---

## Database Integration

### Fetching User Context

```python
# app/database/supabase_client.py
from supabase import create_client, Client
from app.models.user import UserContext
import os

def get_supabase_client() -> Client:
    return create_client(
        os.getenv("SUPABASE_URL"),
        os.getenv("SUPABASE_SERVICE_KEY")
    )

async def get_user_context(user_id: str, supabase: Client) -> UserContext:
    """Fetch user engagement history and following list"""
    
    # Get following list
    following = supabase.table("follows") \
        .select("following_id") \
        .eq("follower_id", user_id) \
        .execute()
    
    # Get recent likes with post content
    recent_likes = supabase.table("likes") \
        .select("post_id, posts(id, content, author_id)") \
        .eq("user_id", user_id) \
        .order("created_at", desc=True) \
        .limit(50) \
        .execute()
    
    return UserContext(
        user_id=user_id,
        following_ids=[f["following_id"] for f in following.data],
        recent_likes=[like["posts"] for like in recent_likes.data if like.get("posts")],
    )
```

### Fetching Candidates

```python
# app/pipeline/sources.py
from typing import List
from app.models.post import PostCandidate
from app.models.user import UserContext
from supabase import Client

class InNetworkSource:
    """Fetch posts from followed accounts (like Thunder)"""
    
    async def fetch(self, ctx: UserContext, supabase: Client) -> List[PostCandidate]:
        if not ctx.following_ids:
            return []
        
        posts = supabase.table("posts") \
            .select("*, profiles(username, display_name, avatar_url)") \
            .in_("author_id", ctx.following_ids) \
            .is_("parent_id", "null") \
            .order("created_at", desc=True) \
            .limit(100) \
            .execute()
        
        return [PostCandidate.from_db(p) for p in posts.data]


class OutOfNetworkSource:
    """Fetch trending/popular posts outside network (simplified Phoenix retrieval)"""
    
    async def fetch(self, ctx: UserContext, supabase: Client) -> List[PostCandidate]:
        excluded_ids = ctx.following_ids + [ctx.user_id] if ctx.following_ids else [ctx.user_id]
        
        # Get popular posts not from followed accounts
        posts = supabase.table("posts") \
            .select("*, profiles(username, display_name, avatar_url)") \
            .not_.in_("author_id", excluded_ids) \
            .is_("parent_id", "null") \
            .order("likes_count", desc=True) \
            .limit(50) \
            .execute()
        
        return [PostCandidate.from_db(p) for p in posts.data]
```

### Recommendation Endpoint

```python
# app/api/recommendations.py
from fastapi import APIRouter, Depends, HTTPException
from app.models.recommendation import RecommendationRequest, RecommendationResponse
from app.pipeline.sources import InNetworkSource, OutOfNetworkSource
from app.pipeline.filters import PreScoringFilters
from app.pipeline.scorers import PhoenixScorer, WeightedScorer
from app.pipeline.selector import TopKSelector
from app.database.supabase_client import get_supabase_client, get_user_context

router = APIRouter()

@router.post("/recommendations", response_model=RecommendationResponse)
async def get_recommendations(request: RecommendationRequest):
    """
    Main recommendation endpoint following x-algorithm pipeline:
    1. Query Hydration - fetch user context
    2. Candidate Sourcing - in-network + out-of-network
    3. Pre-Scoring Filters - remove ineligible posts
    4. Scoring - transformer predictions + weighted combination
    5. Selection - top K by score
    """
    try:
        supabase = get_supabase_client()
        
        # 1. Query Hydration
        user_ctx = await get_user_context(request.user_id, supabase)
        
        # 2. Candidate Sourcing
        in_network = InNetworkSource()
        out_network = OutOfNetworkSource()
        
        in_network_posts = await in_network.fetch(user_ctx, supabase)
        out_network_posts = await out_network.fetch(user_ctx, supabase)
        
        candidates = in_network_posts + out_network_posts
        
        # 3. Pre-Scoring Filters
        filters = PreScoringFilters()
        filtered = await filters.apply(user_ctx, candidates)
        
        # 4. Scoring
        phoenix_scorer = PhoenixScorer()
        weighted_scorer = WeightedScorer()
        
        scored = await phoenix_scorer.score(user_ctx, filtered)
        
        for item in scored:
            item["final_score"] = weighted_scorer.compute_weighted_score(item["predictions"])
        
        # 5. Selection
        selector = TopKSelector(k=request.limit or 50)
        ranked = selector.select(scored)
        
        return RecommendationResponse(
            posts=ranked,
            user_id=request.user_id
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

## Next Steps

### Phase 1: Core Pipeline (MVP)
- [ ] Set up FastAPI project structure
- [ ] Implement Supabase client integration
- [ ] Create basic candidate sources (in-network only)
- [ ] Implement simple scoring (engagement counts)
- [ ] Build `/api/v1/recommendations` endpoint

### Phase 2: ML Integration
- [ ] Add transformer model for content embeddings
- [ ] Implement PhoenixScorer with similarity-based predictions
- [ ] Add WeightedScorer with configurable weights
- [ ] Cache embeddings for performance

### Phase 3: Advanced Features
- [ ] Add out-of-network discovery (two-tower retrieval)
- [ ] Implement author diversity scoring
- [ ] Add filtering (seen posts, blocked users)
- [ ] Fine-tune model on engagement data

### Phase 4: Production
- [ ] Add request caching (Redis)
- [ ] Implement embedding precomputation
- [ ] Set up model serving (optional: ONNX/TensorRT)
- [ ] Add monitoring and metrics

---

## References

- [xai-org/x-algorithm](https://github.com/xai-org/x-algorithm) - Original X recommendation algorithm (Apache 2.0)
- [DeepWiki - x-algorithm](https://deepwiki.com/xai-org/x-algorithm) - Documentation and insights
- [Sentence Transformers](https://www.sbert.net/) - Pre-trained embedding models
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Supabase Python Client](https://supabase.com/docs/reference/python/introduction)

---

*Last updated: February 2026*
