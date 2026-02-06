#!/usr/bin/env python3
"""Comprehensive validation script for the embedding pipeline."""

import requests
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

from app.db.supabase import get_supabase

BASE_URL = "http://localhost:8000/api/v1"

def test_database_state():
    """Verify posts and embeddings in database."""
    print("\n=== Database State ===")
    supabase = get_supabase()
    
    # Count posts
    posts_result = supabase.table("posts").select("id", count="exact").execute()
    post_count = posts_result.count if hasattr(posts_result, 'count') else len(posts_result.data or [])
    print(f"  Posts: {post_count}")
    
    # Count embeddings
    emb_result = supabase.table("post_embeddings").select("post_id", count="exact").execute()
    emb_count = emb_result.count if hasattr(emb_result, 'count') else len(emb_result.data or [])
    print(f"  Embeddings: {emb_count}")
    
    if post_count > 0 and emb_count == post_count:
        print(f"  [OK] All {post_count} posts have embeddings")
        return True
    elif post_count > 0 and emb_count < post_count:
        print(f"  [WARN] {post_count - emb_count} posts missing embeddings")
        return True
    else:
        print(f"  [FAIL] No posts or embeddings found")
        return False

def test_embedding_dimensions():
    """Verify embedding dimensions are correct."""
    print("\n=== Embedding Dimensions ===")
    supabase = get_supabase()
    
    result = supabase.table("post_embeddings").select("embedding_128, base_embedding_384").limit(1).execute()
    
    if not result.data:
        print("  [FAIL] No embeddings found")
        return False
    
    emb = result.data[0]
    try:
        emb_128 = json.loads(emb["embedding_128"])
        emb_384 = json.loads(emb.get("base_embedding_384", "[]"))
        
        print(f"  128-dim embedding: {len(emb_128)} dimensions")
        print(f"  384-dim embedding: {len(emb_384)} dimensions")
        
        if len(emb_128) == 128 and len(emb_384) == 384:
            print("  [OK] Embedding dimensions are correct")
            return True
        else:
            print("  [FAIL] Incorrect embedding dimensions")
            return False
    except Exception as e:
        print(f"  [FAIL] Error parsing embeddings: {e}")
        return False

def test_backfill_api():
    """Test the backfill API endpoint."""
    print("\n=== Backfill API ===")
    try:
        response = requests.post(f"{BASE_URL}/backfill-embeddings?batch_size=10", timeout=120)
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"  Processed: {data.get('processed')} posts")
            print(f"  [OK] Backfill API working")
            return True
        else:
            print(f"  [FAIL] API error: {response.text[:100]}")
            return False
    except Exception as e:
        print(f"  [FAIL] Request failed: {e}")
        return False

def test_recommendations_api():
    """Test the recommendations API."""
    print("\n=== Recommendations API ===")
    try:
        # Get a random user ID
        supabase = get_supabase()
        users = supabase.table("profiles").select("id").limit(1).execute()
        
        if not users.data:
            print("  [FAIL] No users found")
            return False
        
        user_id = users.data[0]["id"]
        response = requests.post(
            f"{BASE_URL}/recommend",
            json={"user_id": user_id, "limit": 5},
            timeout=30
        )
        
        print(f"  Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            post_count = len(data.get("posts", []))
            print(f"  Recommendations returned: {post_count} posts")
            print(f"  [OK] Recommendations API working")
            return True
        else:
            print(f"  [FAIL] API error: {response.text[:100]}")
            return False
    except Exception as e:
        print(f"  [FAIL] Request failed: {e}")
        return False

def main():
    """Run all validation tests."""
    print("=" * 60)
    print("Embedding Pipeline Validation")
    print("=" * 60)
    
    results = []
    results.append(("Database State", test_database_state()))
    results.append(("Embedding Dimensions", test_embedding_dimensions()))
    results.append(("Backfill API", test_backfill_api()))
    results.append(("Recommendations API", test_recommendations_api()))
    
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "[PASS]" if result else "[FAIL]"
        print(f"  {status} {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n[SUCCESS] All embedding pipeline tests passed!")
        return 0
    else:
        print(f"\n[FAILURE] {total - passed} test(s) failed")
        return 1

if __name__ == "__main__":
    exit(main())
