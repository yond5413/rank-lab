# Reranking Algorithm Architecture - Demo Reference

This document provides a comprehensive overview of the reranking system with detailed notes and file references for demo presentations.

---

## Main Architecture Overview

```mermaid
flowchart LR
    subgraph INPUT["1. INPUT"]
        A1["User Request<br/>POST /recommend"]
    end

    subgraph HYDRATION["2. QUERY HYDRATION"]
        B1["User Embedding<br/>128-dim"]
        B2["Following List"]
        B3["Blocked/Muted"]
    end

    subgraph SOURCING["3. CANDIDATE SOURCING"]
        C1["Thunder Pool<br/>In-Network"]
        C2["Phoenix Pool<br/>OON Similarity"]
    end

    subgraph FILTERS["4. FILTERS"]
        D1["Drop Duplicates"]
        D2["Age Filter >7 days"]
        D3["Blocked/Muted Filter"]
    end

    subgraph RANKING["5. MINI LM RANKING"]
        E1["MiniLM-L6-v2"]
        E2["Action Predictions<br/>6 types"]
    end

    subgraph SCORING["6. SCORING"]
        F1["Weighted Score"]
        F2["Author Diversity"]
        F3["OON Weight x0.8"]
    end

    subgraph OUTPUT["7. OUTPUT"]
        G1["Top-K<br/>Default: 30"]
    end

    A1 --> B1
    A1 --> B2
    A1 --> B3
    
    B1 --> C1
    B2 --> C1
    B1 --> C2
    
    C1 --> D1
    C2 --> D1
    D1 --> D2
    D2 --> D3
    
    D3 --> E1
    E1 --> E2
    
    E2 --> F1
    F1 --> F2
    F2 --> F3
    
    F3 --> G1
```

---

## Component Files Reference

| Component | File | Purpose |
|-----------|------|---------|
| **API Entry** | `api/recommendations.py` | HTTP endpoint |
| **Pipeline** | `services/pipeline.py` | Main flow |
| **Two-Tower** | `services/two_tower.py` | Similarity |
| **MiniLM** | `services/minilm_ranker.py` | Action predictions |
| **Filters** | `services/filters.py` | Filtering |
| **Scoring** | `services/scoring.py` | Multi-stage scoring |
| **Online Learning** | `services/online_learning.py` | Real-time updates |

---

## 1. Input Layer

**File:** `backend/app/api/recommendations.py:22-44`

```
POST /api/v1/recommend
Body: {user_id: string, limit: number}
```

Returns: posts[], scores[], total_candidates, processing_time_ms

---

## 2. Query Hydration

**File:** `pipeline.py:28-140`

Parallel fetch: user_embedding, following, blocked/muted
Cache: 5-minute TTL

Tables: user_embeddings, follows, blocks, mutes

---

## 3. Candidate Sourcing

**File:** `pipeline.py:142-234`

**Thunder Pool:** Posts from followed users (limit: 300)
**Phoenix Pool:** Two-tower similarity retrieval (limit: 300)

Similarity = dot(user_emb, post_emb)

---

## 4. Pre-Scoring Filters

**File:** `filters.py`

1. DropDuplicatesFilter
2. CoreDataHydrationFilter  
3. AgeFilter (>7 days)
4. SelfTweetFilter
5. AuthorSocialgraphFilter

---

## 5. MiniLM Ranking

**File:** `minilm_ranker.py:44-190`

Model: sentence-transformers/all-MiniLM-L6-v2 (frozen)
Output: 384-dim embeddings

Action Prediction Head: 768->384->192->6 (sigmoid)

| Action | Weight |
|--------|--------|
| like | 1.0 |
| reply | 1.2 |
| repost | 1.0 |
| not_interested | -2.0 |
| block_author | -10.0 |
| mute_author | -5.0 |

---

## 6. Multi-Stage Scoring

**File:** `scoring.py`

**Stage 1:** score = sum(weight * P(action))

**Stage 2:** multiplier = 0.3 + 0.7^position (diversity)

**Stage 3:** OON posts x 0.8 penalty

---

## 7. Output Layer

**File:** `pipeline.py:327-352`

Top 30 posts returned with scores and timing

---

## Online Learning

**File:** `online_learning.py`

Signal Map: like(+1.0), reply(+1.5), repost(+1.0), block(-2.0), mute(-1.5)

User update: new_emb = (1-a)*current + a*signal*post_emb
Post update: new_emb = current + 0.01*signal*user_emb

Auto-init after 5 engagements

---

## Action Prediction Architecture

```mermaid
flowchart LR
    subgraph USER["User Encoding"]
        U1["User Context"] --> U2["MiniLM"] --> U3["384-dim"]
    end
    
    subgraph POST["Post Encoding"]
        P1["Post Text"] --> P2["MiniLM"] --> P3["384-dim"]
    end
    
    subgraph COMBINE["Combine"]
        U3 --> J1["Concat 768-dim"]
        P3 --> J1
    end
    
    subgraph MLP["MLP Head"]
        J1 --> L1["Linear 768->384"] --> L2["384->192"] --> L3["192->6"] --> OUT["Probs"]
    end
```

---

## Data Flow Sequence

```mermaid
sequenceDiagram
    participant C as Client
    participant API as FastAPI
    participant P as Pipeline
    participant R as Redis
    participant D as DB
    participant M as MiniLM
    participant S as Scorer

    C->>API: POST /recommend
    API->>P: generate_recommendations
    
    par Hydration
        P->>R: GET user_embedding
        alt miss
            P->>D: SELECT embedding
            D-->>P: embedding_128
        end
    end
    
    par Sourcing
        P->>D: SELECT posts from following
        D-->>P: in_network
        P->>D: SELECT post_embeddings
        D-->>P: embeddings
    end
    
    P->>P: Apply filters
    
    P->>M: rank_candidates
    M-->>P: predictions
    
    P->>S: score
    S-->>P: ranked
    
    P-->>API: Response
    API-->>C: posts + scores
```
