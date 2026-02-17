# Two-Tower Model Architecture

The Two-Tower neural network is the core of the recommendation system. It learns user preferences and content embeddings separately, then uses cosine similarity for retrieval.

## Architecture Diagram

```mermaid
flowchart TB
    subgraph UserTower["User Tower (Encoder)"]
        History["Engagement History\n(seq_len * 128)"]
        Transformer["Transformer Encoder\n(4 heads, 2 layers)"]
        Pooling["Mean Pooling"]
        Projection["Linear(128->128)"]
        Norm["L2 Normalize"]
        UserEmb["User Embedding\n(128-dim)"]
    end

    subgraph CandidateTower["Candidate Tower (Encoder)"]
        MiniLM["MiniLM-L6-v2\n(384-dim base)"]
        MLP["MLP\n(384->256->128)"]
        Norm2["L2 Normalize"]
        PostEmb["Post Embedding\n(128-dim)"]
    end

    subgraph Similarity["Similarity Scoring"]
        Dot["Dot Product"]
        Cosine["Cosine Similarity"]
        Rank["Rank by Score"]
    end

    History --> Transformer --> Pooling --> Projection --> Norm --> UserEmb
    MiniLM --> MLP --> Norm2 --> PostEmb

    UserEmb --> Similarity
    PostEmb --> Similarity

    style UserTower fill:#e3f2fd
    style CandidateTower fill:#fff3e0
    style Similarity fill:#f3e5f5
```

## User Tower Details

### Architecture

```mermaid
classDiagram
    class UserTower {
        +int embedding_dim
        +int num_heads
        +int num_layers
        +forward(engagement_history, mask) Tensor
    }

    class TransformerEncoder {
        +nn.TransformerEncoderLayer
        +nn.TransformerEncoder
    }

    class OutputProjection {
        +nn.Linear(128, 128)
    }

    class L2Normalize {
        +functional.normalize
    }

    UserTower --> TransformerEncoder
    UserTower --> OutputProjection
    UserTower --> L2Normalize
```

### Input/Output

| Component | Shape | Description |
|-----------|-------|-------------|
| **Input** | `(batch, seq_len, 128)` | Engagement history of post embeddings |
| **Transformer** | `(batch, seq_len, 128)` | Self-attention over history |
| **Mean Pooling** | `(batch, 128)` | Average over sequence |
| **Projection** | `(batch, 128)` | Linear transform |
| **Output** | `(batch, 128)` | L2 normalized user embedding |

### Training Signal

The User Tower is trained via triplet loss:
- **Anchor**: User embedding at time t
- **Positive**: Post user engaged with after time t
- **Negative**: Random post from same time period

```python
loss = max(0, margin - positive_sim + negative_sim)
```

## Candidate Tower Details

### Architecture

```mermaid
classDiagram
    class CandidateTower {
        +int input_dim
        +int hidden_dim
        +int output_dim
        +forward(post_embedding) Tensor
    }

    class MLP {
        +nn.Sequential
        -- Linear(384, 256)
        -- SiLU()
        -- Linear(256, 128)
        -- SiLU()
        -- Linear(128, 128)
    }

    class L2Normalize {
        +functional.normalize
    }

    CandidateTower --> MLP
    CandidateTower --> L2Normalize
```

### Input/Output

| Component | Shape | Description |
|-----------|-------|-------------|
| **Input** | `(batch, 384)` | MiniLM base embedding |
| **MLP** | `(batch, 128)` | 3-layer projection |
| **Output** | `(batch, 128)` | L2 normalized post embedding |

## MiniLM Pre-trained Encoder

The Candidate Tower uses a frozen MiniLM-L6-v2 encoder for content understanding:

```mermaid
flowchart LR
    subgraph Input["Post Content"]
        Text["Text string"]
    end

    subgraph Encoder["MiniLM-L6-v2"]
        Tokenize["Tokenizer\n(subword tokens)"]
        Transform["12 transformer layers"]
        MeanPool["Mean pooling"]
    end

    subgraph Output["Base Embedding"]
        Base["384-dim vector"]
    end

    Text --> Tokenize --> Transform --> MeanPool --> Base

    style Encoder fill:#e3f2fd
```

## Similarity Computation

```mermaid
flowchart TB
    subgraph Inputs["Embeddings"]
        User["User: 128-dim\n(normalized)"]
        Posts["Candidates: N*128\n(normalized)"]
    end

    subgraph Computation["Dot Product = Cosine Similarity"]
        Dot["user_emb * post_embT"]
    end

    subgraph Output["Scores"]
        Scores["N similarity scores"]
        Rank["Sort descending"]
        TopK["Select top K"]
    end

    Inputs --> Computation
    Computation --> Output

    style Computation fill:#fff3e0
```

## Training Pipeline

```mermaid
flowchart LR
    subgraph Data["Training Data"]
        Pos["Positive pairs\n(user, engaged_post)"]
        Neg["Negative pairs\n(user, unengaged_post)"]
    end

    subgraph Contrastive["Contrastive Loss"]
        PosSim["Sim(user, pos) → 1"]
        NegSim["Sim(user, neg) → -1"]
        Loss["BCE + Margin"]
    end

    subgraph Updates["Weight Updates"]
        MLPWeights["Candidate MLP"]
        UserWeights["User Tower"]
    end

    Data --> Contrastive --> Updates

    style Data fill:#e8f5e9
    style Contrastive fill:#fff3e0
    style Updates fill:#e3f2fd
```

## Hyperparameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| **User Tower Layers** | 2 | Transformer encoder depth |
| **User Tower Heads** | 4 | Multi-head attention heads |
| **User Tower Dim** | 128 | User embedding dimension |
| **Candidate MLP Hidden** | 256 | Hidden layer size |
| **Post Embedding Dim** | 128 | Post embedding dimension |
| **MiniLM Dim** | 384 | Base encoding dimension |
| **Learning Rate** | 1e-4 | Adam optimizer |
| **Batch Size** | 32 | Training batch size |
| **Negative Samples** | 5 | Per positive example |
