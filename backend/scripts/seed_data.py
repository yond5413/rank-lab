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
import time
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

TECH_POSTS = [
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
    "Why I switched from VS Code to Cursor: AI integration is a game changer.",
    "Postgres with pgvector replaces 90% of specialized vector databases.",
    "Microservices are great until you have to debug a distributed transaction.",
    "Clean code is about communication, not just linting rules.",
    "The best documentation is self-documenting code (said no one who had to maintain legacy code).",
]

STARTUP_POSTS = [
    "Just secured our Series A funding! Time to scale the team.",
    "Product-market fit is the only metric that matters in the early days.",
    "Hiring is the most important skill for a non-technical founder.",
    "Growth hacking is dead. Long live community building.",
    "The pivot: from B2C social app to B2B enterprise API. Here's why.",
    "Pitch deck tip: Start with the problem, not the solution.",
    "Building a startup is like jumping off a cliff and assembling a plane on the way down.",
    "Customer feedback loops are the heartbeat of product development.",
    "Don't build for everyone. Build for 100 people who love your product.",
    "Bootstrapping vs VC: The eternal debate. We chose bootstrapping.",
    "Our first 1000 users came from a single Reddit post.",
    "Retention > Acquisition. Fix your leaky bucket first.",
    "Culture eats strategy for breakfast. Define your values early.",
    "Remote-first is the future of work for tech startups.",
    "Failed fast, learned faster. On to the next experiment.",
]

SCIENCE_POSTS = [
    "The James Webb telescope images are absolutely mind-bending.",
    "Quantum computing will break current encryption, but when?",
    "CRISPR technology is advancing faster than ethical guidelines can keep up.",
    "Dark matter makes up 85% of the universe, and we still don't know what it is.",
    "Nuclear fusion breakthrough: net energy gain achieved!",
    "The microbiome gut-brain axis is the next frontier in medicine.",
    "SpaceX Starship launch was spectacular. Multi-planetary species incoming.",
    "Neuroplasticity means you can teach an old dog new tricks.",
    "Climate change solutions need engineering, not just policy.",
    "The mathematics of fractals appears everywhere in nature.",
    "Is consciousness an emergent property of computation?",
    "Biohacking my sleep schedule: results after 30 days.",
]

LIFESTYLE_POSTS = [
    "Digital nomad life: working from a cafe in Bali today.",
    "The pomodoro technique saved my productivity.",
    "Minimalism isn't about owning less, it's about making room for what matters.",
    "Coffee is the fuel of the tech industry. Change my mind.",
    "Weekend hike to disconnect. nature is the best reset button.",
    "Reading 'Atomic Habits' for the third time. It's that good.",
    "Meditation has done more for my coding focus than any tool.",
    "Learning to cook is just following an algorithm with tasty results.",
    "Travel tip: always pack a power strip for airport layovers.",
    "Work-life balance is a myth. It's about work-life integration.",
]

ALL_POSTS = TECH_POSTS + STARTUP_POSTS + SCIENCE_POSTS + LIFESTYLE_POSTS

def escape_sql(val):
    if val is None: return "NULL"
    if isinstance(val, bool): return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)): return str(val)
    return "'" + str(val).replace("'", "''") + "'"

def write_sql(f, table, data, conflict_action="DO NOTHING", schema="public"):
    if not data: return
    keys = list(data[0].keys())
    columns = ", ".join(keys)
    f.write(f"-- {table}\n")
    for row in data:
        values = [escape_sql(row.get(k)) for k in keys]
        val_str = ", ".join(values)
        f.write(f"INSERT INTO {schema}.{table} ({columns}) VALUES ({val_str}) ON CONFLICT {conflict_action};\n")
    f.write("\n")

def seed_profiles():
    """Create test profiles via Auth API and return map."""
    print("Seeding profiles...")

    profiles_data = [
        {
            "username": "alice",
            "display_name": "Alice Chen",
            "bio": "ML Engineer. Building the future of content discovery.",
            "email": "alice@test.com"
        },
        {
            "username": "bob",
            "display_name": "Bob Smith",
            "bio": "Full-stack dev. TypeScript enthusiast.",
            "email": "bob@test.com"
        },
        {
            "username": "carol",
            "display_name": "Carol Davis",
            "bio": "Data scientist. Loves transformers and embeddings.",
            "email": "carol@test.com"
        },
        {
            "username": "dave",
            "display_name": "Dave Wilson",
            "bio": "Backend engineer. FastAPI evangelist.",
            "email": "dave@test.com"
        },
        {
            "username": "eve",
            "display_name": "Eve Founder",
            "bio": "Serial entrepreneur. Building the next unicorn.",
            "email": "eve@test.com"
        },
        {
            "username": "frank",
            "display_name": "Frank Science",
            "bio": "Astrophysics PhD. Space nerd.",
            "email": "frank@test.com"
        },
        {
            "username": "grace",
            "display_name": "Grace Hopper",
            "bio": "Legacy code whisperer. COBOL forever.",
            "email": "grace@test.com"
        },
        {
            "username": "heidi",
            "display_name": "Heidi Traveler",
            "bio": "Digital nomad. 30 countries and counting.",
            "email": "heidi@test.com"
        },
    ]

    # Add more synthetic users to reach ~50 total for better density
    for i in range(42):
        profiles_data.append({
            "username": f"user_{i+1}",
            "display_name": f"User {i+1}",
            "bio": f"Synthetic user {i+1} for load testing.",
            "email": f"user_{i+1}@test.com"
        })

    # Check existing profiles
    response = supabase.table("profiles").select("id, username").execute()
    existing_profiles = {p["username"]: p["id"] for p in (response.data or [])}
    
    profile_map = {}
    updates = []
    auth_users = []
    
    # Generate password hash
    try:
        from passlib.hash import bcrypt
        password_hash = bcrypt.hash("password123")
    except ImportError:
        # Fallback hash for "password123"
        password_hash = "$2a$12$R9h/cIPz0gi.URNNXRkhWOL.W/Wrc.W/Wrc.W/Wrc.W/Wrc.W/Wrc"

    for p in profiles_data:
        username = p["username"]
        
        if username in existing_profiles:
            profile_map[username] = existing_profiles[username]
            # print(f"  Profile '{username}' already exists.")
            updates.append({
                "id": existing_profiles[username],
                "bio": p["bio"],
                "display_name": p["display_name"]
            })
            continue

        # Generate new user
        uid = str(uuid.uuid4())
        profile_map[username] = uid
        
        auth_users.append({
            "id": uid,
            "aud": "authenticated",
            "role": "authenticated",
            "email": p["email"],
            "encrypted_password": password_hash,
            "email_confirmed_at": datetime.utcnow().isoformat(),
            "raw_user_meta_data": json.dumps({"username": username, "display_name": p["display_name"]}),
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        })
        
        updates.append({
            "id": uid,
            "bio": p["bio"],
            "display_name": p["display_name"]
        })

    print(f"  Prepared {len(profiles_data)} profiles (new: {len(auth_users)}).")
    return profile_map, updates, auth_users

def generate_data(profile_map):
    """Generate all data structures."""
    
    usernames = list(profile_map.keys())
    if not usernames:
        return [], [], [], [], [], []
        
    # Posts
    posts_list = []
    posts_to_create = ALL_POSTS.copy()
    
    # Duplicate some posts to have more content if needed, but unique IDs
    # For 50 users, 50 posts is fine, but let's add a few more random ones
    extra_posts = ["Just another day coding.", "Testing the feed.", "Hello world!"]
    for _ in range(20):
        posts_to_create.append(random.choice(extra_posts))

    random.shuffle(posts_to_create)
    
    now = datetime.utcnow()
    
    for i, content in enumerate(posts_to_create):
        author_username = usernames[i % len(usernames)]
        author_id = profile_map[author_username]
        post_time = now - timedelta(hours=random.randint(1, 168))
        
        posts_list.append({
            "id": str(uuid.uuid4()),
            "author_id": author_id,
            "content": content,
            "created_at": post_time.isoformat(),
            "reply_count": 0,
            "repost_count": 0,
            "view_count": 0,
            "likes_count": 0
        })
        
    # Replies
    replies_list = []
    target_posts = random.sample(posts_list, int(len(posts_list) * 0.4))
    
    for parent_post in target_posts:
        num_replies = random.randint(1, 5)
        for _ in range(num_replies):
            author_username = random.choice(usernames)
            author_id = profile_map[author_username]
            if author_id == parent_post["author_id"] and random.random() > 0.2: continue
            
            content = random.choice(["Totally agree!", "Interesting.", "Tell me more.", "Wow!", "Exactly.", "Not sure about this.", "Great point!"])
            
            replies_list.append({
                "id": str(uuid.uuid4()),
                "author_id": author_id,
                "content": content,
                "parent_id": parent_post["id"],
                "created_at": datetime.utcnow().isoformat(),
                "reply_count": 0,
                "repost_count": 0,
                "view_count": 0,
                "likes_count": 0
            })
            
    all_posts = posts_list + replies_list
    
    # Follows
    follows_list = []
    for follower in usernames:
        # Follow 10-20% of other users
        num_follows = max(3, int(len(usernames) * random.uniform(0.1, 0.2)))
        targets = random.sample([u for u in usernames if u != follower], min(len(usernames)-1, num_follows))
        for following in targets:
            follows_list.append({
                "follower_id": profile_map[follower],
                "following_id": profile_map[following]
            })
            
    # Likes & Events - Pareto / Zipfian Distribution
    likes_list = []
    events_list = []
    
    sorted_posts = all_posts.copy()
    # Shuffle first so the "viral" posts are random, not just the first ones created
    random.shuffle(sorted_posts)
    
    print("Generating likes with Pareto distribution...")
    
    total_users = len(usernames)
    
    for i, post in enumerate(sorted_posts):
        # Rank i (0-based). 
        # Probability of like ~ 1 / (rank + 1)^alpha
        # We want top posts to have ~80% of users liking them
        # Tail posts have ~1% or 0 likes.
        
        rank = i + 1
        # Alpha 0.8 gives a nice heavy tail
        probability = 1.0 / (rank ** 0.7) 
        
        # Scale so top rank is ~0.9 probability
        probability = min(0.95, probability * 1.2)
        
        # Determine number of likes for this post based on probability
        # But add some noise
        base_likes = int(total_users * probability)
        noise = random.uniform(0.8, 1.2)
        target_likes = int(base_likes * noise)
        target_likes = max(0, min(target_likes, total_users))
        
        if target_likes > 0:
            likers = random.sample(usernames, target_likes)
            for liker in likers:
                user_id = profile_map[liker]
                likes_list.append({
                    "user_id": user_id,
                    "post_id": post["id"]
                })
                events_list.append({
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "post_id": post["id"],
                    "event_type": "like"
                })
            
    return posts_list, replies_list, follows_list, likes_list, events_list, all_posts

def compute_embeddings(all_posts):
    print("Computing embeddings...")
    from app.services.minilm_ranker import get_minilm_ranker
    from app.services.two_tower import get_two_tower_model
    
    minilm = get_minilm_ranker()
    two_tower = get_two_tower_model()
    
    embeddings_list = []
    count = 0
    for post in all_posts:
        if not post.get("content"): continue
        
        base = minilm.compute_base_embedding(post["content"])
        emb128 = two_tower.compute_post_embedding(base)
        
        embeddings_list.append({
            "post_id": post["id"],
            "embedding_128": json.dumps(emb128.tolist()),
            "base_embedding_384": json.dumps(base),
            "is_pretrained": True,
            "computed_at": datetime.utcnow().isoformat()
        })
        count += 1
        if count % 10 == 0: print(f"  Processed {count} embeddings...")
        
    return embeddings_list

def main():
    print("=" * 60)
    print("Rank Lab Seed Data Generator (SQL Mode)")
    print("=" * 60)

    profile_map, profile_updates, auth_users = seed_profiles()

    if not profile_map:
        print("\nNo profiles found/created.")
        return

    posts, replies, follows, likes, events, all_posts = generate_data(profile_map)
    # Skip embedding computation - posts will enter pipeline without embeddings
    # embeddings = compute_embeddings(all_posts)
    
    # Write SQL
    outfile = "seed_data.sql"
    with open(outfile, "w", encoding="utf-8") as f:
        f.write("-- Seed Data Generated by seed_data.py\n\n")
        
        # Auth Users
        write_sql(f, "users", auth_users, schema="auth")
        
        # Profile updates
        f.write("-- Profile Updates\n")
        for u in profile_updates:
            bio = escape_sql(u["bio"])
            name = escape_sql(u["display_name"])
            uid = escape_sql(u["id"])
            f.write(f"UPDATE public.profiles SET bio={bio}, display_name={name} WHERE id={uid};\n")
        f.write("\n")
        
        write_sql(f, "posts", posts)
        write_sql(f, "posts", replies)
        write_sql(f, "follows", follows)
        write_sql(f, "likes", likes)
        write_sql(f, "engagement_events", events)
        # Skip writing embeddings - will be computed via backfill API
        # write_sql(f, "post_embeddings", embeddings)
        
    print(f"\nSQL file generated at {outfile}")
    print(f"Stats: {len(all_posts)} posts, {len(likes)} likes, 0 embeddings (will be computed via pipeline).")

if __name__ == "__main__":
    main()
