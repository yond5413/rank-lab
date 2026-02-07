# Backend

FastAPI application for ML-powered content ranking and recommendations.

## Tech Stack

- **Framework**: FastAPI 0.109.0
- **Server**: Uvicorn 0.27.0
- **Database**: Supabase (asyncpg)
- **ML/AI**: PyTorch 2.1.2, Transformers 4.36.2, sentence-transformers
- **Validation**: Pydantic 2.5.3

## Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Running

### Development (with auto-reload)

```bash
uvicorn app.main:app --reload --port 8000
```

### Production

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## API Documentation

Once running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Environment Variables

Create `.env` in backend directory:

```env
SUPABASE_URL=https://your-db.supabase.co
SUPABASE_KEY=your-supabase-anon-key
```

`/api/v1/engage` requires a valid user JWT in the `Authorization` header so
RLS can enforce `auth.uid() = user_id`.

## Project Structure

```
app/
├── main.py           # Application entry point
├── api/              # API routes
│   ├── recommendations.py
│   └── admin.py
├── services/         # ML services
│   ├── two_tower.py        # Neural ranking model
│   ├── minilm_ranker.py    # Embedding-based ranking
│   ├── embedding_service.py
│   ├── scoring.py
│   ├── filters.py
│   └── online_learning.py
├── models/           # Pydantic models
├── schemas/          # Request/response schemas
├── db/               # Database clients
└── core/             # Config and logging
scripts/              # Utility scripts
```

## ML Models

- **Two-Tower Network**: Neural collaborative filtering (128-dim embeddings)
- **MiniLM-L6-v2**: Sentence embeddings for content similarity
- **Online Learning**: Continuously updates from user feedback

## API Endpoints

### Recommendations
- `GET /api/v1/recommendations/{user_id}` - Get personalized feed
- `POST /api/v1/recommendations/{user_id}/interact` - Log interaction
- `GET /api/v1/recommendations/search` - Semantic search

### Admin
- `GET /api/v1/admin/stats` - System statistics
- `POST /api/v1/admin/models/retrain` - Trigger model retraining

## Testing

```bash
python test_api.py
```

Runs basic API tests against the local server.
