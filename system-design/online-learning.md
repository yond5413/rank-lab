# Online Learning System

The online learning system continuously updates embeddings based on real-time user engagement, enabling personalization without requiring full model retraining.

## Overview

```mermaid
flowchart TB
    subgraph RealTime["Real-Time Updates (< 10ms)"]
        Event["Engagement Event"]
        UserUpdate["User embedding\nupdate"]
        PostUpdate["Post embedding\nupdate"]
    end

    subgraph Batch["Batch Training (Periodic)"]
        Pairs["Training pairs\ncollection"]
        MLPTrain["Candidate MLP\ntraining"]
        UserTrain["User Tower\ntraining"]
    end

    subgraph Storage["Database"]
        Events["engagement_events"]
        Embeddings["user_embeddings\npost_embeddings"]
        Weights["model_weights"]
    end

    Event --> UserUpdate
    Event --> PostUpdate
    UserUpdate --> Storage
    PostUpdate --> Storage
    Storage --> Pairs
    Pairs --> MLPTrain
    Pairs --> UserTrain
    MLPTrain --> Weights
    UserTrain --> Weights

    style RealTime fill:#e8f5e9
    style Batch fill:#fff8e1
    style Storage fill:#f3e5f5
```

## Engagement Signal Types

```mermaid
flowchart LR
    subgraph Positive["Positive Signals (+1.0 to +1.5)"]
        Like["Like\n+1.0"]
        Reply["Reply\n+1.5"]
        Repost["Repost\n+1.0"]
    end

    subgraph Negative["Negative Signals (-1.0 to -2.0)"]
        NotInterested["Not Interested\n-1.0"]
        Mute["Mute Author\n-1.5"]
        Block["Block Author\n-2.0"]
    end

    subgraph Neutral["Neutral (0.0)"]
        View["View\n0.0"]
    end

    Positive --> UserUpdate
    Negative --> UserUpdate
    View -->|"skipped"| UserUpdate

    style Positive fill:#e8f5e9
    style Negative fill:#ffebee
    style Neutral fill:#f5f5f5
```

## Real-Time User Embedding Update

```mermaid
flowchart TB
    subgraph Trigger["Event Triggered"]
        Event["POST /engage\nuser_id, post_id, event_type"]
        Signal["Lookup signal\nfrom SIGNAL_MAP"]
    end

    subgraph Fetch["Data Fetch"]
        UserEmb["Get user embedding\n(if exists)"]
        PostEmb["Get post embedding"]
    end

    subgraph Check["Condition Check"]
        HasUser{"User has\nembedding?"}
        HasPost{"Post has\nembedding?"}
        Count{"User engagement\ncount >= 5?"}
    end

    subgraph Update["Embedding Update"]
        Alpha["Compute alpha\n= min(0.1, 1/(count+1))"]
        NewEmb["new_emb = (1-alpha)*user + alpha*signal*post"]
        Norm["L2 normalize"]
        Store["Upsert to DB"]
    end

    Trigger --> Fetch
    Fetch --> HasUser
    HasUser -->|No| Count
    Count -->|>= 5| UserTower["Generate via\nUser Tower"]
    UserTower --> Update
    HasUser -->|Yes| HasPost
    HasPost -->|Yes| Update
    Update --> Store

    style Trigger fill:#e8f5e9
    style Fetch fill:#fff8e1
    style Update fill:#e8f5e9
```

## Real-Time Post Embedding Update

```mermaid
flowchart TB
    subgraph SameTrigger["Same Event"]
        Event["Same engagement\nevent as user update"]
    end

    subgraph Fetch2["Data Fetch"]
        PostEmb2["Get post embedding"]
        UserEmb2["Get user embedding"]
    end

    subgraph Update2["Embedding Update"]
        LR["learning_rate = 0.01"]
        NewEmb2["new_emb = post + LR*signal*user"]
        Norm2["L2 normalize"]
        Flag["is_pretrained = False"]
        Store2["Upsert to DB"]
    end

    SameTrigger --> Fetch2
    Fetch2 --> Update2
    Update2 --> Store2

    style SameTrigger fill:#e8f5e9
    style Update2 fill:#fff8e1
```

## Cold Start Flow

```mermaid
flowchart TB
    subgraph State0["Initial State"]
        NewUser["New user\n(no engagements)"]
        ZeroEmb["Embedding: zeros\nor null"]
    end

    subgraph State1["Early Engagements (1-4)"]
        Events1["1-4 likes/replies"]
        NoUpdate["Embedding not\nupdated yet"]
        Fallback["Use popularity/\nrecency scoring"]
    end

    subgraph State2["Threshold Reached (5)"]
        Events2["5th engagement"]
        Check["Check count >= 5"]
        Generate["Call User Tower\nTransformer"]
        InitEmb["Store initial\n128-dim embedding"]
    end

    subgraph State3["Personalized (5+)"]
        Ongoing["Ongoing engagements"]
        RealTime["Real-time\nembedding updates"]
        Personalized["Personalized\nrecommendations"]
    end

    NewUser --> State1
    State1 -->|5th engagement| State2
    State2 --> State3
    State3 --> Ongoing

    style State0 fill:#ffebee
    style State1 fill:#fff8e1
    style State2 fill:#e8f5e9
    style State3 fill:#e8f5e9
```

## Auto-Initialization Logic

```mermaid
flowchart TB
    Start["Engagement event\nfor user without\nembedding"]
    CheckDB["Query\nuser_embeddings\ntable"]
    Found{"Found?"}
    No -->|"count >= 5"| Generate["Generate via\nUser Tower"]
    Generate --> Store["Upsert\nto DB"]
    Store --> Continue["Continue with\nnormal update"]
    Yes -->|"Yes"| Update["Normal\nembedding update"]
    
    CheckDB --> Found
    
    Found -->|No| Count["Query\nengagement_events\ncount"]
    Count -->|"count < 5"| Skip["Skip update\n(need more data)"]
    Skip --> End
    
    Continue --> End
    Update --> End
    Store --> End

    style Found fill:#fff8e1
    style Generate fill:#e8f5e9
    style Skip fill:#ffebee
```

## Batch Training Pipeline

```mermaid
flowchart LR
    subgraph Collection["1. Training Pair Collection"]
        Events["Recent engagements\n(last 24h)"]
        Pos["Positive: (user, post)\nwhere engaged"]
        Neg["Negative: (user, post)\nviewed but not engaged"]
    end

    subgraph Training["2. Model Training"]
        Contrastive["Contrastive loss\nCandidate MLP"]
        Triplet["Triplet loss\nUser Tower"]
    end

    subgraph Storage2["3. Persistence"]
        SaveWeights["model_weights table"]
        Refresh["Trigger embedding\nrefresh"]
    end

    Collection --> Training --> Storage2

    style Collection fill:#e8f5e9
    style Training fill:#fff8e1
    style Storage2 fill:#f3e5f5
```

### Negative Sampling Strategy

```mermaid
flowchart TB
    Positive["Positive pair:\nUser U, Post P\n(engaged at T)"]
    
    subgraph Window["1-Hour Window"]
        BeforeT["Posts viewed\nT-1h to T"]
    end
    
    subgraph Filter["2. Filter Out"]
        Engaged["Posts user\nalready engaged with"]
    end
    
    subgraph Sample["3. Random Sample"]
        Negatives["5 random posts\n(not engaged)"]
    end

    Positive --> Window --> Filter --> Sample

    style Sample fill:#e8f5e9
```

## Update Frequency

| Component | Trigger | Latency | Frequency |
|-----------|---------|---------|-----------|
| User Embedding | Engagement event | < 10ms | Every engagement |
| Post Embedding | Engagement event | < 10ms | Every engagement |
| Engagement Log | User action | < 10ms | Every action |
| Candidate MLP | 1000+ new pairs | ~30s | Hourly |
| User Tower | 128+ users | ~2min | Hourly |
| Full Embedding Refresh | Scheduled | ~5min | Daily |

## Fallback Strategies

```mermaid
flowchart TB
    subgraph Normal["Normal Operation"]
        Personalized["User embedding exists\n-> Personalized feed"]
    end

    subgraph Fallback1["Fallback 1: Content-Based"]
        NoUser["No user embedding"]
        MiniLM["MiniLM only\n(no personalization)"]
        Content["Content similarity\nranking"]
    end

    subgraph Fallback2["Fallback 2: Popularity"]
        NoEmbeddings["No embeddings\nat all"]
        Popular["Engagement counts\n(likes, reposts)"]
        Recency["Post recency"]
    end

    Personalized -->|No user embedding| Fallback1
    Fallback1 -->|System error| Fallback2

    style Normal fill:#e8f5e9
    style Fallback1 fill:#fff8e1
    style Fallback2 fill:#ffebee
```

## API Endpoints

### Trigger Engagement

```
POST /api/v1/engage
{
  "user_id": "uuid",
  "post_id": "uuid", 
  "event_type": "like" | "reply" | "repost" | "view" | "not_interested"
}
```

### Trigger User Embedding Generation

```
POST /api/v1/admin/user-embeddings/generate
{
  "user_id": "uuid",
  "min_engagements": 0
}
```

### Backfill All User Embeddings

```
POST /api/v1/admin/user-embeddings/backfill?min_engagements=0&batch_size=100
```

### Backfill Post Embeddings

```
POST /api/v1/recommendations/backfill-embeddings?batch_size=50
```

## Monitoring Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Embedding update latency | < 10ms | > 50ms |
| Training pair generation | > 100/hour | < 10/hour |
| Positive/Negative ratio | 1:5 to 1:10 | < 1:3 or > 1:20 |
| User embedding coverage | > 90% | < 70% |
| Cold start post CTR | > 1% | < 0.5% |
