#!/usr/bin/env python3
"""Test script for batch training functionality."""

import asyncio
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.online_learning import get_batch_training_service
from app.core.logging import logger


async def test_batch_training():
    """Test the batch training pipeline."""
    print("Testing batch training...")

    # Get service
    service = get_batch_training_service()

    # Step 1: Collect training pairs
    print("\n1. Collecting training pairs...")
    pairs = await service.collect_training_pairs()
    print(f"   Found {len(pairs)} training pairs")

    if len(pairs) < 10:
        print(f"   WARNING: Insufficient pairs for training (need at least 10)")
        print(f"   TIP: This is expected if you have few engagement events")
        return {
            "status": "skipped",
            "reason": "insufficient_training_data",
            "pairs_collected": len(pairs),
        }

    # Step 2: Train candidate MLP
    print("\n2. Training Candidate Tower MLP...")
    metrics = await service.train_candidate_mlp(pairs)
    print(f"   Training completed:")
    print(f"   - Loss: {metrics['loss']:.4f}")
    print(f"   - Accuracy: {metrics['accuracy']:.4f}")

    return {
        "status": "success",
        "pairs_collected": len(pairs),
        "loss": metrics["loss"],
        "accuracy": metrics["accuracy"],
    }


async def main():
    print("=" * 60)
    print("Batch Training Test Script")
    print("=" * 60)

    try:
        result = await test_batch_training()

        print("\n" + "=" * 60)
        print("Test Results:")
        print("=" * 60)
        print(f"Status: {result['status']}")

        if result["status"] == "success":
            print(f"SUCCESS: Training completed successfully!")
            print(f"   Pairs: {result['pairs_collected']}")
            print(f"   Loss: {result['loss']:.4f}")
            print(f"   Accuracy: {result['accuracy']:.4f}")
        elif result["status"] == "skipped":
            print(f"WARNING: Training skipped")
            print(f"   Reason: {result.get('reason', 'unknown')}")
            print(f"   Pairs collected: {result.get('pairs_collected', 0)}")
        else:
            print(f"ERROR: Training failed")
            print(f"   Error: {result.get('error', 'unknown')}")

        print("=" * 60)

    except Exception as e:
        print(f"\nERROR during testing: {e}")
        import traceback

        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
