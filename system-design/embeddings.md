# Embeddings System

Embeddings are 128-dimensional vectors that represent users and posts in a shared semantic space. Similar users and posts are close together, enabling personalized recommendations.

## Embedding Types

```mermaid
flowchart TB
    subgraph Embeddings["Embedding Space"]
        subgraph UserEmbeddings["User Embeddings"]
            UE1["User A\n(interested in tech)"]
            UE2["User B\n(interested in art)"]
            UE3["User C\n(mixed)"]
        end

        subgraph PostEmbeddings["Post Embeddings"]
            PE1["Tech post"]
            PE2["Art post"]
            PE3["Politics post"]
        end
    end

    UE1 <-->|Similar| PE1
    UE2 <-->|Similar| PE2
    UE3 <-->|Similar| PE3

    style UserEmbeddings fill:#e3f2fd
    style PostEmbeddings fill:#fff3e0
```

## Post Embedding Pipeline

```mermaid
flowchart LR
    subgraph Creation["Post Creation"]
        Content["Post Content"]
        Compute["Compute Embedding"]
        Store["Upsert to DB"]
    end

    subgraph Update["Online Learning"]
        Engagements["User Engagements"]
        Nudge["Shift embedding"]
        ReNorm["L2 normalize"]
    end

    Content --> Compute --> Store
    Engagements --> Nudge --> ReNorm --> Store

    style Creation fill:#e8f5e9
    style Update fill:#fff3e0
```

### Initial Computation

| Step | Component | Output |
|------|-----------|--------|
| 1 | MiniLM-L6-v2 Encoder | 384-dim base embedding |
| 2 | Candidate Tower MLP | 128-dim projected embedding |
| 3 | L2 Normalization | Unit sphere (norm=1) |
| 4 | Database Upsert | `post_embeddings` table |

### Online Update Formula

```
new_embedding = normalize(current + learning_rate * signal * user_embedding)
```

| Signal | Meaning | Update Direction |
|--------|---------|-----------------|
| +1.0 | Like/Repost | Move toward user |
| +1.5 | Reply | Strong move toward user |
| -1.0 | Not interested | Move away from user |
| -2.0 | Block author | Strong move away |

## User Embedding Pipeline

```mermaid
flowchart TB
    subgraph ColdStart["Cold Start (< 5 engagements)"]
        Zero["Zero vector\nor random init"]
        Fallback["Popularity-based\nrecommendations"]
    end

    subgraph Warmup["Warmup (5+ engagements)"]
        History["Engagement history"]
        UserTower["User Tower\nTransformer"]
        InitEmb["Initial embedding"]
    end

    subgraph Personalization["Online Personalization"]
        RealTime["Real-time updates\nfrom new engagements"]
        Batch["Batch training\nfrom engagement pairs"]
    end

    ColdStart -->|5+ engagements| Warmup
    Warmup --> Personalization

    style ColdStart fill:#ffebee
    style Warmup fill:#fff8e1
    style Personalization fill:#e8f5e9
```

### Auto-Initialization Trigger

```mermaid
flowchart TB
    Start["User engages\nwith content"]
    Check{"Has user\nembedding?"}
    Yes --> Update["Update embedding\nreal-time"]
    No --> Count["Count user's\nengagements"]
    Count -->|>= 5| Generate["Generate via\nUser Tower"]
    Generate --> Update
    Count -->|< 5| Wait["Wait for more\nengagements"]
    Wait --> Start

    style Count fill:#fff8e1
    style Generate fill:#e8f5e9
```

### Moving Average Update

```
alpha = min(0.1, 1.0 / (engagement_count + 1))

new_embedding = (1 - alpha) * current + alpha * signal * post_embedding
new_embedding = normalize(new_embedding)
```

## Embedding Storage Schema

```mermaid
erDiagram
    post_embeddings {
        uuid post_id PK
        jsonb embedding_128 "128-dim vector"
        jsonb base_embedding_384 "MiniLM output"
        bool is_pretrained "False after online learning"
        timestamp created_at
        timestamp updated_at
    }

    user_embeddings {
        uuid user_id PK
        jsonb embedding_128 "128-dim vector"
        int engagement_count "Num events used"
        timestamp created_at
        timestamp updated_at
    }

    engagement_events {
        uuid id PK
        uuid user_id FK
        uuid post_id FK
        varchar event_type "like/reply/repost/view"
        timestamp created_at
    }
```

### Table: `post_embeddings`

| Column | Type | Description |
|--------|------|-------------|
| `post_id` | UUID | FK to posts table |
| `embedding_128` | JSONB | 128-dim embedding as array |
| `base_embedding_384` | JSONB | 384-dim MiniLM output |
| `is_pretrained` | BOOL | True if never personalized |

### Table: `user_embeddings`

| Column | Type | Description |
|--------|------|-------------|
| `user_id` | UUID | FK to users table |
| `embedding_128` | JSONB | 128-dim user embedding |
| `engagement_count` | INT | Number of engagements used |

## Backfill Operations

### Triggering Backfill

```mermaid
flowchart LR
    Admin["Admin API\nPOST /backfill"]
    Service["Embedding Service"]
    Workers["Background Workers"]
    DB["Supabase"]

    Admin --> Service
    Service --> Workers
    Workers --> DB

    Service -->|"async process"| Workers
```

### Backfill Flow

```mermaid
flowchart TB
    Start["Backfill triggered"]
    Query["Query users with\nengagement history"]
    Query -->|"GROUP BY user_id\nHAVING COUNT >= min"| Users
    Users --> Loop["For each user"]
    Loop --> Fetch["Fetch engagement\nhistory (50 max)"]
    Fetch --> Posts["Get post\nembeddings"]
    Posts --> Tower["Pass through\nUser Tower"]
    Tower --> Store["Upsert to\nuser_embeddings"]
    Store --> Metrics["Log metrics"]

    style Start fill:#e8f5e9
    style Loop fill:#fff3e0
    style Metrics fill:#e3f2fd
```

## Similarity Search

```mermaid
flowchart TB
    subgraph Query["Query"]
        User["User embedding"]
    end

    subgraph Retrieval["Two-Stage Retrieval"]
        Candidates["Candidates\n(100-1000)"]
        Filter["Filters\n(exclude seen)"]
        Score["Similarity score"]
        Rank["Sort by score"]
    end

    subgraph Output["Results"]
        TopK["Top 20\nrecommendations"]
    end

    Query --> Candidates
    Candidates --> Filter --> Score --> Rank --> TopK

    style Query fill:#e8f5e9
    style Retrieval fill:#fff3e0
    style Output fill:#e8f5e9
```

## Cold Start Handling

```mermaid
flowchart TB
    NewUser["New User"] --> NoEmb["No embedding yet"]
    NoEmb -->|0 engagements| Popular["Popularity-based feed"]
    
    Engagements["User accumulates\nengagements"]
    Popular --> Engagements
    
    Engagements -->|"5+ engagements"| AutoInit["Auto-generate\nembedding"]
    
    AutoInit --> Personalized["Personalized\nrecommendations"]

    NewPost["New Post"] --> ColdPost["Cold post\nembedding created"]
    ColdPost --> ContentBased["Content-based\nrecommendations"]
    
    ColdPost -->|"User engages"| OnlineLearn["Online\npersonalization"]

    style NoEmb fill:#ffebee
    style Popular fill:#fff8e1
    style AutoInit fill:#e8f5e9
    style Personalized fill:#e8f5e9
    style ColdPost fill:#ffebee
    style OnlineLearn fill:#e8f5e9
```
