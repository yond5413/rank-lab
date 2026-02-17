#!/usr/bin/env python3
"""LLM Content Generator for Seed Data.

Uses OpenRouter API to generate diverse post content for the recommendation system.
Model: openai/gpt-oss-20b:free (or fallback to meta-llama/llama-3.1-70b-instruct)

Usage:
    python -m scripts.llm_content_gen --category tech --count 100
    python -m scripts.llm_content_gen --all --count 5000
"""

import os
import sys
import json
import argparse
import random
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
import asyncio
import aiohttp

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


TOPIC_CATEGORIES = {
    "tech": {
        "examples": [
            "programming",
            "AI",
            "machine learning",
            "APIs",
            "web development",
            "databases",
            "devops",
            "cybersecurity",
        ],
        "count": 800,
        "tone": "technical, informative, sometimes nerdy",
    },
    "startup": {
        "examples": [
            "founding a startup",
            "funding",
            "product-market fit",
            "growth hacking",
            "hiring",
            "pitch decks",
        ],
        "count": 600,
        "tone": "inspirational, business-focused, entrepreneurial",
    },
    "science": {
        "examples": [
            "space exploration",
            "physics",
            "biology",
            "climate change",
            "quantum computing",
            "astronomy",
        ],
        "count": 500,
        "tone": "curious, educational, wonder-filled",
    },
    "lifestyle": {
        "examples": [
            "travel",
            "productivity",
            "health",
            "fitness",
            "mindfulness",
            "minimalism",
            "remote work",
        ],
        "count": 500,
        "tone": "personal, reflective, practical",
    },
    "entertainment": {
        "examples": [
            "movies",
            "music",
            "gaming",
            "TV shows",
            "books",
            "podcasts",
            "comedy",
        ],
        "count": 400,
        "tone": "opinionated, entertaining, shareable",
    },
    "sports": {
        "examples": [
            "football",
            "basketball",
            "soccer",
            "tennis",
            "esports",
            "Olympics",
            "fitness",
        ],
        "count": 400,
        "tone": "passionate, competitive, fan-focused",
    },
    "news": {
        "examples": [
            "politics",
            "economy",
            "technology news",
            "world events",
            "policy",
            "elections",
        ],
        "count": 400,
        "tone": "informative, analytical, sometimes controversial",
    },
    "food": {
        "examples": [
            "cooking",
            "recipes",
            "restaurants",
            "food photography",
            "healthy eating",
            "culinary tips",
        ],
        "count": 300,
        "tone": "appetizing, practical, visually-oriented",
    },
    "art": {
        "examples": [
            "design",
            "photography",
            "illustration",
            "writing",
            "music production",
            "creative process",
        ],
        "count": 300,
        "tone": "creative, expressive, artistic",
    },
    "finance": {
        "examples": [
            "investing",
            "cryptocurrency",
            "personal finance",
            "career advice",
            "side hustles",
            "real estate",
        ],
        "count": 300,
        "tone": "practical, analytical, wealth-building",
    },
    "education": {
        "examples": [
            "learning",
            "online courses",
            "teaching",
            "study tips",
            "academic research",
            "self-improvement",
        ],
        "count": 300,
        "tone": "educational, encouraging, knowledge-sharing",
    },
    "humor": {
        "examples": [
            "jokes",
            "memes",
            "satire",
            "observations",
            "relatable moments",
            "wholesome content",
        ],
        "count": 300,
        "tone": "funny, lighthearted, relatable",
    },
}


class LLMContentGenerator:
    """Generate diverse post content using OpenRouter API."""

    def __init__(
        self, api_key: Optional[str] = None, model: str = "openai/gpt-oss-20b:free"
    ):
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        self.model = model
        self.base_url = "https://openrouter.ai/api/v1/chat/completions"

        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY not found in environment")

    async def _call_api(
        self, session: aiohttp.ClientSession, messages: List[Dict]
    ) -> str:
        """Call OpenRouter API."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://rank-lab.local",
            "X-Title": "Rank Lab Seed Data Generator",
        }

        data = {
            "model": self.model,
            "messages": messages,
            "max_tokens": 400,
            "temperature": 0.8,
        }

        async with session.post(self.base_url, json=data, headers=headers) as response:
            if response.status != 200:
                error_text = await response.text()
                raise Exception(f"API error {response.status}: {error_text}")

            result = await response.json()
            return result["choices"][0]["message"]["content"]

    def _build_batch_prompt(self, category: str, num_posts: int = 20) -> str:
        """Build prompt for batch posts generation."""
        category_info = TOPIC_CATEGORIES[category]
        tone = category_info["tone"]
        examples = ", ".join(category_info["examples"][:5])  # Use first 5 examples

        prompt = f"""Generate {num_posts} diverse short social media posts about: {examples}.

Requirements:
- Tone: {tone}
- Each post: 30-150 characters (concise, tweet-style)
- No hashtags, no emojis
- Authentic, like a real person on social media
- Can be opinionated, informative, or personal
- Variety: different angles, opinions, styles

Return as a JSON array of strings: ["post1", "post2", "post3", ...]
Only return the JSON array, nothing else."""
        return prompt

    def _parse_batch_response(
        self, response: str, existing_posts: List[str]
    ) -> List[str]:
        """Parse batch posts from LLM response."""
        posts = []

        try:
            # Try to parse as JSON
            # The response might have markdown code blocks, so clean it
            response = response.strip()
            if response.startswith("```json"):
                response = response[7:]
            if response.startswith("```"):
                response = response[3:]
            if response.endswith("```"):
                response = response[:-3]

            data = json.loads(response.strip())

            if isinstance(data, list):
                for content in data:
                    content = str(content).strip()
                    # Validate
                    if 20 <= len(content) <= 200:
                        if content not in existing_posts and content not in posts:
                            posts.append(content)

        except json.JSONDecodeError:
            # Fallback: try to extract lines
            for line in response.split("\n"):
                line = line.strip().strip('"').strip("'")
                if 20 <= len(line) <= 200:
                    if line not in existing_posts and line not in posts:
                        posts.append(line)
        except Exception as e:
            print(f"  Parse error: {e}")

        return posts

    async def _call_api_batch(
        self, session: aiohttp.ClientSession, messages: List[Dict], num_posts: int = 20
    ) -> List[str]:
        """Call OpenRouter API for batch generation."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://rank-lab.local",
            "X-Title": "Rank Lab Seed Data Generator",
        }

        data = {
            "model": self.model,
            "messages": messages,
            "max_tokens": 2000,  # More tokens for batch
            "temperature": 0.8,
        }

        async with session.post(self.base_url, json=data, headers=headers) as response:
            if response.status != 200:
                error_text = await response.text()
                raise Exception(f"API error {response.status}: {error_text}")

            result = await response.json()
            return result["choices"][0]["message"]["content"]

    async def generate_posts_for_category(
        self,
        session: aiohttp.ClientSession,
        category: str,
        count: int,
        existing_posts: List[str],
        batch_size: int = 20,
    ) -> List[str]:
        """Generate posts for a specific category using batch API calls."""
        category_info = TOPIC_CATEGORIES[category]

        posts = []

        # Calculate number of batches needed
        num_batches = (count + batch_size - 1) // batch_size

        for batch_num in range(num_batches):
            # Last batch might be smaller
            current_batch_size = min(batch_size, count - batch_num * batch_size)

            prompt = self._build_batch_prompt(category, current_batch_size)
            messages = [{"role": "user", "content": prompt}]

            try:
                content = await self._call_api_batch(
                    session, messages, current_batch_size
                )
                batch_posts = self._parse_batch_response(content, existing_posts)

                posts.extend(batch_posts)
                existing_posts.extend(batch_posts)

                print(
                    f"  Batch {batch_num + 1}/{num_batches}: generated {len(batch_posts)} posts for {category}"
                )

            except Exception as e:
                print(f"  Error generating batch {batch_num + 1}/{num_batches}: {e}")
                continue

        return posts

    async def generate_all_posts(self, total_count: int = 5000) -> List[str]:
        """Generate posts across all categories."""
        print(f"\n{'=' * 60}")
        print(f"LLM Content Generator")
        print(f"{'=' * 60}")
        print(f"Target: {total_count} posts")
        print(f"Model: {self.model}")
        print(f"{'=' * 60}\n")

        # Distribute posts across categories proportionally
        all_posts = []

        # Calculate distribution
        total_weight = sum(info["count"] for info in TOPIC_CATEGORIES.values())

        async with aiohttp.ClientSession() as session:
            for category, info in TOPIC_CATEGORIES.items():
                # Calculate proportional count
                proportion = info["count"] / total_weight
                count = max(10, int(total_count * proportion))

                print(f"\nGenerating {count} posts for category: {category}")
                posts = await self.generate_posts_for_category(
                    session, category, count, all_posts
                )
                print(f"  Generated {len(posts)} unique posts for {category}")
                all_posts.extend(posts)

        # Shuffle to mix categories
        random.shuffle(all_posts)

        # Trim or pad to exact count
        if len(all_posts) > total_count:
            all_posts = all_posts[:total_count]

        print(f"\n{'=' * 60}")
        print(f"Generated {len(all_posts)} total posts")
        print(f"{'=' * 60}\n")

        return all_posts


def generate_posts_sync(total_count: int = 5000) -> List[str]:
    """Synchronous wrapper for generating posts."""
    try:
        generator = LLMContentGenerator()
        return asyncio.run(generator.generate_all_posts(total_count))
    except Exception as e:
        print(f"Error: {e}")
        return []


async def main():
    parser = argparse.ArgumentParser(description="Generate LLM content for seed data")
    parser.add_argument(
        "--category", type=str, help="Specific category to generate for"
    )
    parser.add_argument(
        "--count", type=int, default=100, help="Number of posts to generate"
    )
    parser.add_argument(
        "--all", action="store_true", help="Generate for all categories"
    )
    parser.add_argument(
        "--total", type=int, default=5000, help="Total posts when using --all"
    )
    parser.add_argument(
        "--output", type=str, help="Output file for generated posts (JSON)"
    )

    args = parser.parse_args()

    generator = LLMContentGenerator()

    if args.all:
        posts = await generator.generate_all_posts(args.total)
    elif args.category:
        if args.category not in TOPIC_CATEGORIES:
            print(f"Unknown category: {args.category}")
            print(f"Available: {', '.join(TOPIC_CATEGORIES.keys())}")
            return

        async with aiohttp.ClientSession() as session:
            posts = await generator.generate_posts_for_category(
                session, args.category, args.count, []
            )
        print(f"\nGenerated {len(posts)} posts for {args.category}")
    else:
        print("Specify --category or --all")
        return

    # Output
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(posts, f, indent=2)
        print(f"Saved to {args.output}")
    else:
        for i, post in enumerate(posts[:10], 1):
            print(f"{i}. {post[:80]}...")
        if len(posts) > 10:
            print(f"... and {len(posts) - 10} more")


if __name__ == "__main__":
    asyncio.run(main())
