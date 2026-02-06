#!/usr/bin/env python3
"""Quick API test script"""

import requests
import json

BASE_URL = "http://localhost:8000/api/v1"


def test_health():
    """Test health endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"Health Check: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Health Check FAILED: {e}")
        return False


def test_admin_weights():
    """Test admin weights endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/admin/weights", timeout=5)
        print(f"\nAdmin Weights: {response.status_code}")
        data = response.json()
        print(f"Source: {data.get('source')}")
        print(f"Weights: {json.dumps(data.get('weights'), indent=2)}")
        return response.status_code == 200
    except Exception as e:
        print(f"Admin Weights FAILED: {e}")
        return False


def test_admin_stats():
    """Test admin stats endpoint"""
    try:
        response = requests.get(f"{BASE_URL}/admin/stats", timeout=5)
        print(f"\nAdmin Stats: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        return response.status_code == 200
    except Exception as e:
        print(f"Admin Stats FAILED: {e}")
        return False


if __name__ == "__main__":
    print("=" * 50)
    print("Testing Rank Lab API")
    print("=" * 50)

    results = []
    results.append(("Health", test_health()))
    results.append(("Admin Weights", test_admin_weights()))
    results.append(("Admin Stats", test_admin_stats()))

    print("\n" + "=" * 50)
    print("Test Results:")
    print("=" * 50)
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"  {name}: {status}")
    print("=" * 50)
