# Batch Training

## Overview

Batch training improves recommendation quality by continuously learning from user engagement patterns. The system automatically triggers training after every **75 engagements** to optimize the Candidate Tower MLP.

## How It Works

### 1. Engagement Collection
The system collects engagement events (likes, replies, views) and creates training pairs:
- **Positive pairs**: User engaged with content (liked, replied, reposted)
- **Negative pairs**: User saw but didn't engage within the same timeframe

### 2. Model Training
When 75 engagements accumulate, training triggers automatically:
- **Algorithm**: Contrastive loss with binary cross-entropy
- **Target**: Maximize similarity for positive pairs, minimize for negative
- **Duration**: ~30 seconds for 1,000 pairs

### 3. Weight Updates
Trained weights replace previous weights in the database:
- Versioned with timestamps
- Previous versions preserved (can rollback if needed)
- Takes effect immediately for new recommendations

## Metrics Explained

### Training Loss
Measures prediction error. Range: 0.0 (perfect) to ∞.

| Status | Range | Meaning |
|--------|-------|---------|
| 🟢 **Good** | < 0.5 | Model learning effectively |
| 🟡 **Monitor** | 0.5 - 0.8 | Acceptable but watch trend |
| 🔴 **Warning** | > 0.8 | Investigate data quality |

### Training Accuracy
Percentage of correct predictions. Range: 0% to 100%.

| Status | Range | Meaning |
|--------|-------|---------|
| 🟢 **Good** | > 70% | Model performing well |
| 🟡 **Monitor** | 50% - 70% | Needs more data |
| 🔴 **Warning** | < 50% | Check data quality |

### Training Pairs
Number of samples used for training.

| Status | Count | Meaning |
|--------|-------|---------|
| 🟢 **Ready** | 10+ | Can train |
| 🟡 **Collecting** | 5-9 | Almost ready |
| 🔴 **Insufficient** | < 5 | Wait for more data |

## Best Practices

### Enable Auto-Training
Auto-training is enabled by default. It triggers after every 75 engagements. This ensures continuous improvement without manual intervention.

### Monitor Weekly
Check metrics weekly to ensure:
- Loss trending down over time
- Accuracy trending up over time
- Regular training occurrences

### After Major Changes
After major content or algorithm changes:
1. Disable auto-training temporarily (if option available)
2. Manually trigger training
3. Monitor results closely
4. Re-enable auto-training

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Loss not decreasing | Wait for more diverse engagement data |
| Accuracy stuck low | Check engagement quality, ensure diverse content |
| Training never triggers | Verify users are actively engaging |
| Metrics not showing | Check training completed successfully |

## FAQ

**Q: How often does training run?**
A: Every 75 engagements by default, or manually triggered.

**Q: Can I revert bad training?**
A: Yes, previous weights are versioned in the database. Contact admin to restore a previous version.

**Q: Does training affect users?**
A: No, training runs in a background process. Serving continues normally without interruption.

**Q: What if training fails?**
A: Errors are logged to the alerts system. Previous weights remain active. Check logs for details.

**Q: Where are metrics stored?**
A: Metrics are stored in the `training_metrics` table with full history preserved.

## Quick Start

### 1. Check Status
```bash
curl http://localhost:8000/api/v1/admin/batch-training/metrics
```

Response:
```json
{
  "loss": 0.2341,
  "accuracy": 0.852,
  "pairs_count": 156,
  "last_trained": "2026-02-07T12:00:00",
  "version": "2026-02-07"
}
```

### 2. View History
```bash
curl http://localhost:8000/api/v1/admin/batch-training/history?limit=30
```

### 3. Trigger Training Manually
```bash
curl -X POST http://localhost:8000/api/v1/admin/batch-training/run
```

Response:
```json
{
  "status": "completed",
  "pairs_collected": 156,
  "loss": 0.2341,
  "accuracy": 0.852,
  "trained_at": "2026-02-07T12:00:00"
}
```

### 4. Monitor Results
- Watch accuracy improve in the dashboard
- Check loss decreasing over time
- Ensure regular training occurrences

## Related Documentation
- [Recommendation System Overview](/admin/docs/recommendations)
- [Engagement Events](/admin/docs/engagement)
- [Model Weights](/admin/docs/model-weights)
