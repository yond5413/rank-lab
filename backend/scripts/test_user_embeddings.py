"""Test script for user embedding generation."""

import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

def test_user_embedding_stats():
    """Test fetching user embedding stats."""
    print("\n=== Testing User Embedding Stats ===")
    response = requests.get(f"{BASE_URL}/admin/user-embeddings/stats")
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(json.dumps(data, indent=2))
        return data
    else:
        print(f"Error: {response.text}")
        return None

def test_backfill_user_embeddings(min_engagements=0, batch_size=100):
    """Test backfilling user embeddings."""
    print(f"\n=== Testing User Embedding Backfill (min_engagements={min_engagements}, batch_size={batch_size}) ===")
    response = requests.post(
        f"{BASE_URL}/admin/user-embeddings/backfill",
        params={"min_engagements": min_engagements, "batch_size": batch_size}
    )
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(json.dumps(data, indent=2))
        return data
    else:
        print(f"Error: {response.text}")
        return None

def test_generate_single_user(user_id, min_engagements=0):
    """Test generating embedding for a single user."""
    print(f"\n=== Testing Single User Embedding Generation (user_id={user_id}) ===")
    response = requests.post(
        f"{BASE_URL}/admin/user-embeddings/generate",
        json={"user_id": user_id, "min_engagements": min_engagements}
    )
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(json.dumps(data, indent=2))
        return data
    else:
        print(f"Error: {response.text}")
        return None

def verify_database_counts():
    """Verify counts in the database."""
    print("\n=== Verifying Database Counts ===")
    # This would need direct database access, so we'll use the stats endpoint
    return test_user_embedding_stats()

if __name__ == "__main__":
    print("=" * 60)
    print("User Embedding Generation Test Suite")
    print("=" * 60)
    
    # Test 1: Check initial stats
    initial_stats = test_user_embedding_stats()
    
    # Test 2: Backfill user embeddings
    backfill_result = test_backfill_user_embeddings(min_engagements=0, batch_size=100)
    
    # Test 3: Check stats after backfill
    final_stats = test_user_embedding_stats()
    
    # Test 4: Test single user generation (if we have a user ID)
    if initial_stats and initial_stats.get('users_with_engagements', 0) > 0:
        # We'll use a known user ID from the engagement events
        test_user_id = "d3c24c56-3aa9-4537-803b-8f7b5e91b25e"
        single_result = test_generate_single_user(test_user_id)
    
    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    if initial_stats and final_stats:
        print(f"Initial user embeddings: {initial_stats.get('users_with_embeddings', 0)}")
        print(f"Final user embeddings: {final_stats.get('users_with_embeddings', 0)}")
        print(f"Coverage: {final_stats.get('coverage_percentage', 0):.1f}%")
        
        if backfill_result:
            print(f"\nBackfill Results:")
            print(f"  - Processed: {backfill_result.get('processed', 0)}")
            print(f"  - Successful: {backfill_result.get('successful', 0)}")
            print(f"  - Failed: {backfill_result.get('failed', 0)}")
    
    print("\n✅ Test suite completed!")
