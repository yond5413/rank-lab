# Rank-Lab System Design

Rank-Lab is a personalized content recommendation system inspired by X's open-source algorithm. This document describes the architecture of the entire system, from frontend to backend to ML models.

## Architecture Overview

### Full System Architecture

```mermaid
flowchart TB
    subgraph Frontend["Next.js Frontend"]
        UI["Pages & Components"]
        State["State Management"]
        API["API Client lib/api.ts"]
    end

    subgraph Backend["FastAPI Backend"]
        Routes["API Routes"]
        subgraph Services["ML Services"]
            TwoTower["Two-Tower Model"]
            MiniLM["MiniLM Encoder"]
            Embedding["Embedding Service"]
            Online["Online Learning"]
            Scoring["Scoring Pipeline"]
            Filters["Content Filters"]
        end
        Cache["Redis Cache"]
    end

    subgraph Database["Supabase"]
        Posts["posts"]
        Users["users"]
        UserEmbeddings["user_embeddings"]
        PostEmbeddings["post_embeddings"]
        Engagements["engagement_events"]
        ModelWeights["model_weights"]
    end

    Frontend -->|"HTTP/REST"| Backend
    Backend -->|"Async Queries"| Database
    Backend -->|"Model Inference"| Services

    style Frontend fill:#e1f5fe
    style Backend fill:#fff3e0
    style Database fill:#f3e5f5
```

### Frontend Architecture

```mermaid
flowchart TB
    subgraph Pages["Next.js App Router"]
        Home["app/page.tsx"]
        Feed["app/feed/page.tsx"]
        Auth["app/auth/"]
        Admin["app/admin/"]
    end

    subgraph Components["React Components"]
        FeedUI["Feed.tsx"]
        PostCard["PostCard.tsx"]
        AdminPanel["admin/"]
    end

    subgraph State["State Management"]
        ReactQuery["@tanstack/react-query"]
        Context["React Context"]
    end

    subgraph API["API Layer"]
        Client["lib/supabase.ts"]
        AdminAPI["lib/adminApi.ts"]
        PublicAPI["lib/api.ts"]
    end

    Pages --> Components
    Components --> State
    State --> API

    style Pages fill:#e8f5e9
    style Components fill:#e8f5e9
    style State fill:#fff8e1
    style API fill:#e3f2fd
```

### Backend Architecture

```mermaid
flowchart TB
    subgraph API["FastAPI Routes"]
        Recommendations["recommendations.py"]
        Admin["admin.py"]
    end

    subgraph Services["Core Services"]
        TwoTower["two_tower.py\nUserTower + CandidateTower"]
        MiniLM["minilm_ranker.py\nSentence Embeddings"]
        Embedding["embedding_service.py\nGeneration & Storage"]
        Online["online_learning.py\nReal-Time Updates"]
        Scoring["scoring.py\nRanking Score"]
        Filters["filters.py\nContent Filters"]
        Pipeline["pipeline.py\nOrchestration"]
    end

    subgraph Database["Supabase Client"]
        Supabase["supabase.py\nAsync Client"]
    end

    API --> Services
    Services --> Database

    style API fill:#e3f2fd
    style Services fill:#fff3e0
    style Database fill:#f3e5f5
```

## Quick Links

| Document | Description |
|----------|-------------|
| [Data Flow](data-flow.md) | Request lifecycle and data transformations |
| [Two-Tower Model](two-tower-model.md) | Neural recommendation architecture |
| [Embeddings](embeddings.md) | Embedding generation and storage |
| [Online Learning](online-learning.md) | Real-time personalization updates |

## Tech Stack Summary

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14, React, TypeScript, Tailwind CSS |
| **Backend** | FastAPI, Python 3.11+, Uvicorn |
| **Database** | Supabase (PostgreSQL) |
| **ML Framework** | PyTorch 2.1, Transformers 4.36 |
| **Embeddings** | MiniLM-L6-v2 (384-dim), Two-Tower (128-dim) |
| **Caching** | Redis (async) |
| **API Docs** | Swagger UI, ReDoc |
