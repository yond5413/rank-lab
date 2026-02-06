#!/usr/bin/env python3
"""Seed script: populate test profiles, posts, follows, and compute embeddings.

Usage:
    cd backend
    python -m scripts.seed_data

Requires SUPABASE_URL and SUPABASE_KEY env vars (or a .env file).
"""

import os
import sys
import json
import uuid
import random
from datetime import datetime, timedelta
from pathlib import Path

# Add backend root to path so we can import app modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set.")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

SAMPLE_POSTS = [
    "Just shipped a new feature! The recommendation engine is finally coming together.",
    "Machine learning is not magic — it's just a lot of linear algebra and gradient descent.",
    "Hot take: the best code is the code you never have to write.",
    "Working on embedding pipelines today. Transformers are surprisingly elegant.",
    "Anyone else feel like debugging ML models is 90% staring at loss curves?",
    "Two-tower retrieval models are underrated for content discovery.",
    "The future of social feeds is personalization without filter bubbles.",
    "TypeScript + Next.js + Supabase is an incredible stack for side projects.",
    "Attention is all you need — both in transformers and in life.",
    "Just learned about candidate isolation masking. Mind. Blown.",
    "Building in public: our recommendation system ranks 600 candidates in under a second.",
    "Online learning is the secret sauce for keeping recommendations fresh.",
    "FastAPI + PyTorch = the perfect backend for ML-powered APIs.",
    "The hardest part of building a feed algorithm? Defining what 'good' means.",
    "Spent all day optimizing dot product similarity. Numpy is a gift.",
    "Real-time embedding updates make cold-start problems way more manageable.",
    "Controversial: chronological feeds are objectively worse for discovery.",
    "Fun fact: Twitter's algorithm open-sourced in 2023 inspired this project.",
    "Pydantic makes data validation feel almost enjoyable. Almost.",
    "Supabase row-level security is genuinely one of the best features I've used.",
]


def seed_profiles():
    """Create test profiles (idempotent via upsert on username)."""
    print("Seeding profiles...")

    # Check if profiles already exist
    response = supabase.table("profiles").select("id, username").execute()
    existing = {p["username"]: p["id"] for p in (response.data or [])}

    profiles = [
        {
            "username": "alice",
            "display_name": "Alice Chen",
            "bio": "ML Engineer. Building the future of content discovery.",
        },
        {
            "username": "bob",
            "display_name": "Bob Smith",
            "bio": "Full-stack dev. TypeScript enthusiast.",
        },
        {
            "username": "carol",
            "display_name": "Carol Davis",
            "bio": "Data scientist. Loves transformers and embeddings.",
        },
        {
            "username": "dave",
            "display_name": "Dave Wilson",
            "bio": "Backend engineer. FastAPI evangelist.",
        },
    ]

    created = {}
    for profile in profiles:
        if profile["username"] in existing:
            created[profile["username"]] = existing[profile["username"]]
            print(f"  Profile '{profile['username']}' already exists.")
            continue

        # We need an auth user first. For seed data, we'll use the admin API
        # or just check if we can insert directly.
        # Since profiles FK to auth.users, we'll use the service role or
        # rely on existing auth users. For now, generate UUIDs and try.
        profile_id = str(uuid.uuid4())
        try:
            data = {
                "id": profile_id,
                "username": profile["username"],
                "display_name": profile["display_name"],
                "bio": profile["bio"],
            }
            result = supabase.table("profiles").insert(data).execute()
            if result.data:
                created[profile["username"]] = profile_id
                print(f"  Created profile: {profile['username']} ({profile_id})")
            else:
                print(f"  WARNING: Could not create profile '{profile['username']}'")
        except Exception as e:
            print(f"  ERROR creating profile '{profile['username']}': {e}")
            # If FK constraint fails, we may need auth users first
            if profile["username"] in existing:
                created[profile["username"]] = existing[profile["username"]]

    return created


def seed_posts(profiles: dict):
    """Create sample posts across profiles."""
    print("Seeding posts...")

    if not profiles:
        print("  No profiles available, skipping posts.")
        return []

    usernames = list(profiles.keys())
    created_posts = []
    now = datetime.utcnow()

    for i, content in enumerate(SAMPLE_POSTS):
        author_username = usernames[i % len(usernames)]
        author_id = profiles[author_username]

        # Stagger timestamps
        post_time = now - timedelta(hours=random.randint(1, 72))

        try:
            data = {
                "author_id": author_id,
                "content": content,
                "created_at": post_time.isoformat(),
            }
            result = supabase.table("posts").insert(data).execute()
            if result.data:
                post = result.data[0]
                created_posts.append(post)
                print(f"  Post by {author_username}: \"{content[:50]}...\"")
        except Exception as e:
            print(f"  ERROR creating post: {e}")

    return created_posts


def seed_follows(profiles: dict):
    """Create follow relationships (everyone follows everyone else)."""
    print("Seeding follows...")
    usernames = list(profiles.keys())

    for follower in usernames:
        for following in usernames:
            if follower == following:
                continue
            try:
                data = {
                    "follower_id": profiles[follower],
                    "following_id": profiles[following],
                }
                supabase.table("follows").insert(data).execute()
                print(f"  {follower} -> {following}")
            except Exception as e:
                # Likely duplicate
                if "duplicate" in str(e).lower() or "unique" in str(e).lower():
                    print(f"  {follower} -> {following} (already exists)")
                else:
                    print(f"  ERROR: {e}")


def seed_embeddings(posts: list):
    """Compute and store embeddings for all seeded posts."""
    print("Computing post embeddings...")

    if not posts:
        print("  No posts to embed.")
        return

    # Lazy import so model loading only happens if needed
    from app.services.embedding_service import get_embedding_service

    service = get_embedding_service()

    for post in posts:
        post_id = post["id"]
        content = post.get("content", "")
        if not content:
            continue

        try:
            service.compute_and_store_post_embedding(post_id, content)
            print(f"  Embedded post {post_id[:8]}...")
        except Exception as e:
            print(f"  ERROR embedding {post_id}: {e}")


def main():
    print("=" * 60)
    print("Rank Lab Seed Data")
    print("=" * 60)

    profiles = seed_profiles()

    if not profiles:
        print("\nNo profiles created. If profiles FK to auth.users, you need")
        print("to create auth users first (e.g. via Supabase dashboard).")
        print("Then re-run this script.")
        return

    posts = seed_posts(profiles)
    seed_follows(profiles)
    seed_embeddings(posts)

    print("\n" + "=" * 60)
    print("Seed complete!")
    print(f"  Profiles: {len(profiles)}")
    print(f"  Posts: {len(posts)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
