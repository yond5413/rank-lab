#!/usr/bin/env python3
"""Seed script: populate test profiles, posts, follows, and compute embeddings.

Usage:
    cd backend
    python -m scripts.seed_data [--posts N] [--no-llm]

Options:
    --posts N     Number of posts to generate (default: 5000)
    --no-llm     Skip LLM generation, use templates only

Requires SUPABASE_URL and SUPABASE_KEY env vars (or a .env file).
Optional: OPENROUTER_API_KEY for LLM content generation.
"""

import os
import sys
import json
import uuid
import random
import time
import asyncio
import argparse
from datetime import datetime, timedelta
from pathlib import Path

# Add backend root to path so we can import app modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set.")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

DEFAULT_NUM_POSTS = 5000

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

# Additional posts for variety (used when LLM is not available)
ADDITIONAL_POSTS = [
    "Just another day coding.",
    "Testing the feed.",
    "Hello world!",
    "Hot take: tabs are better than spaces.",
    "Weekend project turned into a month-long obsession.",
    "Why does debugging always take 3x longer than writing the code?",
    "The best code is the code you don't have to maintain.",
    "Finally fixed that bug that's been haunting me for days.",
    "New personal record: 47 browser tabs open.",
    "Coffee count today: 4. Productivity: questionable.",
    "The documentation said it would work. It did not.",
    "My code works, I have no idea why.",
    "Todo list: 1. Fix bug  2. Write tests  3. Go home",
    "Stack overflow saved my life today.",
    "Git merge conflicts: the only true evil.",
    "Pro tip: close that one tab and your code will start working.",
    "I've been stuck on this for 6 hours. Restarted VS Code. Fixed.",
    "The meeting that could have been an email.",
    "My test suite is 90% skipped tests.",
    "Shipping Friday at 5pm. Living on the edge.",
]


def escape_sql(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    return "'" + str(val).replace("'", "''") + "'"


async def generate_llm_posts(count: int = 5000):
    """Generate posts using LLM via OpenRouter."""
    if not OPENROUTER_API_KEY:
        print("  No OPENROUTER_API_KEY found, using templates.")
        return None

    try:
        from scripts.llm_content_gen import LLMContentGenerator

        print(f"  Generating {count} posts via LLM...")
        generator = LLMContentGenerator(api_key=OPENROUTER_API_KEY)
        posts = await generator.generate_all_posts(count)
        print(f"  LLM generated {len(posts)} posts")
        return posts
    except Exception as e:
        print(f"  LLM generation failed: {e}")
        return None


def write_sql(f, table, data, conflict_action="DO NOTHING", schema="public"):
    if not data:
        return
    keys = list(data[0].keys())
    columns = ", ".join(keys)
    f.write(f"-- {table}\n")
    for row in data:
        values = [escape_sql(row.get(k)) for k in keys]
        val_str = ", ".join(values)
        f.write(
            f"INSERT INTO {schema}.{table} ({columns}) VALUES ({val_str}) ON CONFLICT {conflict_action};\n"
        )
    f.write("\n")


def seed_profiles():
    """Get existing profiles and prepare for seed data generation.

    Uses existing profiles from the database (no auth user creation).
    Skips updating the user's main account (yonathan_daniel).
    """
    print("Getting existing profiles...")

    profiles_data = [
        {
            "username": "alice",
            "display_name": "Alice Chen",
            "bio": "ML Engineer. Building the future of content discovery.",
            "email": "alice@test.com",
        },
        {
            "username": "bob",
            "display_name": "Bob Smith",
            "bio": "Full-stack dev. TypeScript enthusiast.",
            "email": "bob@test.com",
        },
        {
            "username": "carol",
            "display_name": "Carol Davis",
            "bio": "Data scientist. Loves transformers and embeddings.",
            "email": "carol@test.com",
        },
        {
            "username": "dave",
            "display_name": "Dave Wilson",
            "bio": "Backend engineer. FastAPI evangelist.",
            "email": "dave@test.com",
        },
        {
            "username": "eve",
            "display_name": "Eve Founder",
            "bio": "Serial entrepreneur. Building the next unicorn.",
            "email": "eve@test.com",
        },
        {
            "username": "frank",
            "display_name": "Frank Science",
            "bio": "Astrophysics PhD. Space nerd.",
            "email": "frank@test.com",
        },
        {
            "username": "grace",
            "display_name": "Grace Hopper",
            "bio": "Legacy code whisperer. COBOL forever.",
            "email": "grace@test.com",
        },
        {
            "username": "heidi",
            "display_name": "Heidi Traveler",
            "bio": "Digital nomad. 30 countries and counting.",
            "email": "heidi@test.com",
        },
    ]

    # Add more synthetic users to reach ~50 total for better density
    for i in range(42):
        profiles_data.append(
            {
                "username": f"user_{i + 1}",
                "display_name": f"User {i + 1}",
                "bio": f"Synthetic user {i + 1} for load testing.",
                "email": f"user_{i + 1}@test.com",
            }
        )

    # Check existing profiles
    response = supabase.table("profiles").select("id, username").execute()
    existing_profiles = {p["username"]: p["id"] for p in (response.data or [])}

    profile_map = {}
    updates = []
    auth_users = []  # Skip auth creation - using existing profiles

    # User accounts to skip (don't modify these)
    EXCLUDED_USERNAMES = ["yonathan_daniel", "admin", "root"]

    for p in profiles_data:
        username = p["username"]

        if username in existing_profiles:
            profile_map[username] = existing_profiles[username]
            # Skip updating excluded usernames (user's personal accounts)
            if username not in EXCLUDED_USERNAMES:
                updates.append(
                    {
                        "id": existing_profiles[username],
                        "bio": p["bio"],
                        "display_name": p["display_name"],
                    }
                )
            continue

        # For new profiles (if any), just skip auth creation
        # We'll use existing profiles only to avoid bcrypt issues
        uid = str(uuid.uuid4())
        profile_map[username] = uid

        # Skip auth user creation - just create profile entry
        updates.append(
            {
                "id": uid,
                "bio": p["bio"],
                "display_name": p["display_name"],
            }
        )

    # Also fetch ALL existing profiles (including user's main account) for engagement
    # This ensures we use all available profile IDs
    for username, user_id in existing_profiles.items():
        if username not in profile_map:
            profile_map[username] = user_id

    print(f"  Found {len(profile_map)} existing profiles (skipping auth creation)")
    print(f"  Will update {len(updates)} seed profiles")
    return profile_map, updates, auth_users


def generate_data(profile_map, num_posts=5000, use_llm=True):
    """Generate all data structures."""

    usernames = list(profile_map.keys())
    if not usernames:
        return [], [], [], [], [], [], [], [], []

    # Posts
    posts_list = []
    now = datetime.utcnow()

    if use_llm and OPENROUTER_API_KEY:
        print("  Attempting LLM content generation...")
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        llm_posts = loop.run_until_complete(generate_llm_posts(num_posts))
        loop.close()

        if llm_posts and len(llm_posts) >= num_posts * 0.8:
            posts_to_create = llm_posts
        else:
            print("  LLM generation incomplete, using templates...")
            posts_to_create = (ALL_POSTS + ADDITIONAL_POSTS * 200)[:num_posts]
    else:
        # Use templates - repeat to get desired count
        posts_to_create = (ALL_POSTS + ADDITIONAL_POSTS * 200)[:num_posts]
        random.shuffle(posts_to_create)

    print(f"  Creating {len(posts_to_create)} posts...")

    for i, content in enumerate(posts_to_create):
        author_username = usernames[i % len(usernames)]
        author_id = profile_map[author_username]
        post_time = now - timedelta(hours=random.randint(1, 720))  # Up to 30 days

        posts_list.append(
            {
                "id": str(uuid.uuid4()),
                "author_id": author_id,
                "content": content,
                "created_at": post_time.isoformat(),
                "reply_count": 0,
                "repost_count": 0,
                "view_count": 0,
                "likes_count": 0,
                "bookmarks_count": 0,
            }
        )

    # Replies
    print("  Generating replies...")
    replies_list = []
    target_posts = random.sample(
        posts_list, int(len(posts_list) * random.uniform(0.05, 0.15))
    )
    reply_contents = [
        "Totally agree!",
        "Interesting.",
        "Tell me more.",
        "Wow!",
        "Exactly.",
        "Not sure about this.",
        "Great point!",
        "I see what you mean.",
        "Makes sense.",
        "Thanks for sharing!",
    ]

    for parent_post in target_posts:
        num_replies = random.randint(1, 3)
        for _ in range(num_replies):
            author_username = random.choice(usernames)
            author_id = profile_map[author_username]
            if author_id == parent_post["author_id"] and random.random() > 0.2:
                continue

            content = random.choice(reply_contents)
            reply_time = now - timedelta(hours=random.randint(1, 168))

            replies_list.append(
                {
                    "id": str(uuid.uuid4()),
                    "author_id": author_id,
                    "content": content,
                    "parent_id": parent_post["id"],
                    "created_at": reply_time.isoformat(),
                    "reply_count": 0,
                    "repost_count": 0,
                    "view_count": 0,
                    "likes_count": 0,
                    "bookmarks_count": 0,
                }
            )
            # Increment reply count on parent
            parent_post["reply_count"] += 1

    all_posts = posts_list + replies_list

    # Follows
    print("  Generating follows...")
    follows_list = []
    for follower in usernames:
        num_follows = max(3, int(len(usernames) * random.uniform(0.1, 0.2)))
        targets = random.sample(
            [u for u in usernames if u != follower],
            min(len(usernames) - 1, num_follows),
        )
        for following in targets:
            follows_list.append(
                {
                    "follower_id": profile_map[follower],
                    "following_id": profile_map[following],
                }
            )

    # Build follower map for views generation
    follower_map = {}
    for f in follows_list:
        fid = str(f["following_id"])
        if fid not in follower_map:
            follower_map[fid] = []
        follower_map[fid].append(f["follower_id"])

    # Likes & Events - Pareto Distribution
    likes_list = []
    events_list = []

    sorted_posts = all_posts.copy()
    random.shuffle(sorted_posts)

    print("  Generating likes (Pareto distribution)...")
    total_users = len(usernames)

    for i, post in enumerate(sorted_posts):
        rank = i + 1
        probability = 1.0 / (rank**0.7)
        probability = min(0.95, probability * 1.2)

        base_likes = int(total_users * probability)
        noise = random.uniform(0.8, 1.2)
        target_likes = int(base_likes * noise)
        target_likes = max(0, min(target_likes, total_users))

        if target_likes > 0:
            likers = random.sample(usernames, target_likes)
            for liker in likers:
                user_id = profile_map[liker]
                likes_list.append({"user_id": user_id, "post_id": post["id"]})
                events_list.append(
                    {
                        "id": str(uuid.uuid4()),
                        "user_id": user_id,
                        "post_id": post["id"],
                        "event_type": "like",
                    }
                )
            post["likes_count"] = target_likes

    # Reposts
    print("  Generating reposts...")
    reposts_list = []
    target_posts = random.sample(
        posts_list, int(len(posts_list) * random.uniform(0.03, 0.10))
    )

    for post in target_posts:
        num_reposts = random.randint(1, 2)
        for _ in range(num_reposts):
            author_username = random.choice(usernames)
            author_id = profile_map[author_username]
            if author_id == post["author_id"]:
                continue

            reposts_list.append(
                {
                    "id": str(uuid.uuid4()),
                    "author_id": author_id,
                    "content": post["content"],
                    "created_at": datetime.utcnow().isoformat(),
                    "reply_count": 0,
                    "repost_count": 0,
                    "view_count": 0,
                    "likes_count": 0,
                    "bookmarks_count": 0,
                    "repost_of_id": post["id"],
                }
            )
            events_list.append(
                {
                    "id": str(uuid.uuid4()),
                    "user_id": author_id,
                    "post_id": post["id"],
                    "event_type": "repost",
                }
            )
            post["repost_count"] += 1

    # Views
    print("  Generating views...")
    for post in all_posts:
        author_id = str(post["author_id"])
        followers = follower_map.get(author_id, [])

        # Views from followers
        num_views = len(followers)

        # Random additional views (out-of-network)
        num_views += random.randint(10, 100)

        # Create view events
        viewer_samples = random.sample(usernames, min(num_views, total_users))
        for viewer in viewer_samples:
            user_id = profile_map[viewer]
            events_list.append(
                {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "post_id": post["id"],
                    "event_type": "view",
                }
            )
        post["view_count"] = len(viewer_samples)

    # Bookmarks
    print("  Generating bookmarks...")
    bookmarks_list = []
    target_posts = random.sample(posts_list, int(len(posts_list) * 0.1))

    for post in target_posts:
        num_bookmarks = random.randint(1, 5)
        bookmarkers = random.sample(usernames, min(num_bookmarks, total_users))
        for bookmarker in bookmarkers:
            user_id = profile_map[bookmarker]
            bookmarks_list.append(
                {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "post_id": post["id"],
                    "created_at": datetime.utcnow().isoformat(),
                }
            )
            post["bookmarks_count"] += 1

    # Blocks
    print("  Generating blocks...")
    blocks_list = []
    num_blocks = int(len(usernames) * len(usernames) * 0.03)
    for _ in range(num_blocks):
        blocker = random.choice(usernames)
        blocked = random.choice([u for u in usernames if u != blocker])
        blocks_list.append(
            {"blocker_id": profile_map[blocker], "blocked_id": profile_map[blocked]}
        )

    # Mutes
    print("  Generating mutes...")
    mutes_list = []
    num_mutes = int(len(usernames) * len(usernames) * 0.07)
    for _ in range(num_mutes):
        muter = random.choice(usernames)
        muted = random.choice([u for u in usernames if u != muter])
        mutes_list.append(
            {"muter_id": profile_map[muter], "muted_id": profile_map[muted]}
        )

    return (
        posts_list,
        replies_list,
        follows_list,
        likes_list,
        events_list,
        all_posts,
        bookmarks_list,
        blocks_list,
        mutes_list,
    )


def compute_embeddings(all_posts):
    print("Computing embeddings...")
    from app.services.minilm_ranker import get_minilm_ranker
    from app.services.two_tower import get_two_tower_model

    minilm = get_minilm_ranker()
    two_tower = get_two_tower_model()

    embeddings_list = []
    count = 0
    for post in all_posts:
        if not post.get("content"):
            continue

        base = minilm.compute_base_embedding(post["content"])
        emb128 = two_tower.compute_post_embedding(base)

        embeddings_list.append(
            {
                "post_id": post["id"],
                "embedding_128": json.dumps(emb128.tolist()),
                "base_embedding_384": json.dumps(base),
                "is_pretrained": True,
                "computed_at": datetime.utcnow().isoformat(),
            }
        )
        count += 1
        if count % 10 == 0:
            print(f"  Processed {count} embeddings...")

    return embeddings_list


def main():
    parser = argparse.ArgumentParser(description="Generate seed data for Rank Lab")
    parser.add_argument(
        "--posts",
        type=int,
        default=DEFAULT_NUM_POSTS,
        help=f"Number of posts to generate (default: {DEFAULT_NUM_POSTS})",
    )
    parser.add_argument(
        "--no-llm", action="store_true", help="Skip LLM generation, use templates only"
    )
    parser.add_argument(
        "--skip-embeddings", action="store_true", help="Skip embedding computation"
    )

    args = parser.parse_args()

    print("=" * 60)
    print("Rank Lab Seed Data Generator (SQL Mode)")
    print("=" * 60)
    print(
        f"Posts: {args.posts}, LLM: {not args.no_llm}, Embeddings: {not args.skip_embeddings}"
    )

    profile_map, profile_updates, auth_users = seed_profiles()

    if not profile_map:
        print("\nNo profiles found/created.")
        return

    print(f"  Found {len(profile_map)} existing profiles to use")

    posts, replies, follows, likes, events, all_posts, bookmarks, blocks, mutes = (
        generate_data(profile_map, num_posts=args.posts, use_llm=not args.no_llm)
    )

    embeddings = []
    user_embeddings = []

    if not args.skip_embeddings:
        embeddings = compute_embeddings(all_posts)
        # User embeddings would need post embeddings first, so skip for now

    # Write SQL
    outfile = "scripts/seed_data.sql"
    with open(outfile, "w", encoding="utf-8") as f:
        f.write(f"-- Seed Data Generated by seed_data.py\n")
        f.write(f"-- Generated: {datetime.utcnow().isoformat()}\n")
        f.write(
            f"-- Posts: {len(posts)}, Replies: {len(replies)}, Events: {len(events)}\n\n"
        )

        # Profile updates (skip auth.users since we use existing profiles)
        f.write("-- Profile Updates\n")
        for u in profile_updates:
            bio = escape_sql(u["bio"])
            name = escape_sql(u["display_name"])
            uid = escape_sql(u["id"])
            f.write(
                f"UPDATE public.profiles SET bio={bio}, display_name={name} WHERE id={uid};\n"
            )
        f.write("\n")

        write_sql(f, "posts", posts)
        write_sql(f, "posts", replies)
        write_sql(f, "follows", follows)
        write_sql(f, "likes", likes)
        write_sql(f, "engagement_events", events)
        write_sql(f, "bookmarks", bookmarks)
        write_sql(f, "blocks", blocks)
        write_sql(f, "mutes", mutes)

        if embeddings:
            write_sql(f, "post_embeddings", embeddings)

    print(f"\nSQL file generated at {outfile}")
    print(f"Stats:")
    print(f"  Posts: {len(posts)}")
    print(f"  Replies: {len(replies)}")
    print(f"  Follows: {len(follows)}")
    print(f"  Likes: {len(likes)}")
    print(f"  Engagement Events: {len(events)}")
    print(f"  Bookmarks: {len(bookmarks)}")
    print(f"  Blocks: {len(blocks)}")
    print(f"  Mutes: {len(mutes)}")
    print(f"  Post Embeddings: {len(embeddings)}")


if __name__ == "__main__":
    main()
