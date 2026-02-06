# Rank Lab

AI-powered content recommendation and ranking system.

## Architecture

- **Frontend**: Next.js 16 + React 19 + TypeScript + Tailwind CSS v4
- **Backend**: FastAPI + Python + PyTorch ML models
- **Database**: Supabase (Postgres)

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- Supabase account

### 1. Environment Setup

Copy the example environment file and fill in your values:

```bash
cp env.example .env.local
```

Required variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL`

### 2. Run Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`, backend on `http://localhost:8000`.

## Project Structure

```
rank-lab/
├── frontend/          # Next.js application
│   ├── app/          # Next.js app router
│   ├── components/   # React components
│   └── lib/          # Utilities
├── backend/          # FastAPI application
│   ├── app/         # Main application
│   │   ├── api/     # API routes
│   │   ├── services/# ML services
│   │   └── core/    # Config & logging
│   └── scripts/     # Utility scripts
└── db/              # Database migrations
```

## Features

- **ML-Powered Ranking**: Two-tower neural network + MiniLM embeddings
- **Real-time Recommendations**: Personalized content feed
- **Admin Dashboard**: Manage models and view analytics
- **Online Learning**: Continuously improves from user interactions

## Development

- Backend API docs: `http://localhost:8000/docs`
- Frontend: `http://localhost:3000`
