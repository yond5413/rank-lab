# X-Algorithm Implementation Notes

> Verification of our understanding and decisions for smaller-scale implementation.

---

## Core Architecture (Verified Correct)

### Two-Tower Retrieval
- **User Tower**: Transformer processes user engagement history → 128-dim embedding
- **Candidate Tower**: 2-layer MLP with SiLU activation → 128-dim embedding
- **Similarity**: Dot product between user and candidate embeddings
- **Output**: top_k_indices + top_k_scores
- **Position**: Candidate Sourcing stage (BEFORE enrichment/hydration)

### Pipeline Execution Flow
1. **Query Hydration** (sequential)
2. **Candidate Sourcing** (parallel: Thunder + Phoenix)
3. **Candidate Hydration** (parallel)
4. **Pre-Scoring Filters** (sequential)
5. **Scoring** (sequential):
   - PhoenixScorer → WeightedScorer → AuthorDiversityScorer → OONScorer
6. **Selection** (TopKScoreSelector)
7. **Post-Selection Filters** (sequential)

### Candidate Isolation (Transformer Ranker)
- Candidates attend to user history: ✓
- Candidates attend to themselves: ✓
- Candidates attend to OTHER candidates: ✗
- Achieved via attention mask in transformer

---

## Corrections from Verification

### Filter Order (CRITICAL FIX)
**Our docs had wrong order. Actual order:**
1. DropDuplicatesFilter
2. CoreDataHydrationFilter
3. AgeFilter
4. SelfTweetFilter
5. RetweetDeduplicationFilter
6. IneligibleSubscriptionFilter
7. PreviouslySeenPostsFilter
8. PreviouslyServedPostsFilter
9. MutedKeywordFilter
10. AuthorSocialgraphFilter

**We missed in our docs:**
- CoreDataHydrationFilter
- SelfTweetFilter
- RetweetDeduplicationFilter
- IneligibleSubscriptionFilter
- PreviouslyServedPostsFilter
- MutedKeywordFilter

### AuthorDiversityScorer Formula
**Our docs said**: `score *= 0.7^author_count`

**Actual formula**: `(1.0 - floor) * decay_factor^position + floor`
- `position` = count of author's posts in ranked list so far (not consecutive)
- Applied during scoring to weighted_score

### Post-Selection Filters (Missing from our docs)
1. **VFFilter**: Final visibility checks (deleted/spam/violence)
2. **DedupConversationFilter**: Avoid multiple posts from same thread

### Data Added During Hydration
**PostCandidate enriched with:**
- `core_data`: text, author_id, timestamp, retweeted_user_id, retweeted_tweet_id, in_reply_to_tweet_id
- `author_screen_name`, `author_follower_count`
- `is_in_network`: bool
- `video_duration_ms`
- `subscription_author_ids`

---

## Missing Components to Evaluate

### Full Filter List
| Filter | Purpose | Priority for Small Scale |
|--------|---------|--------------------------|
| DropDuplicatesFilter | Remove duplicate posts | HIGH |
| CoreDataHydrationFilter | Ensure core data present | HIGH |
| AgeFilter | Remove old posts | MEDIUM |
| SelfTweetFilter | Remove user's own posts | MEDIUM |
| RetweetDeduplicationFilter | Deduplicate retweets | LOW |
| IneligibleSubscriptionFilter | Filter subscription content | LOW (skip) |
| PreviouslySeenPostsFilter | Remove already seen | HIGH |
| PreviouslyServedPostsFilter | Remove recently served | MEDIUM |
| MutedKeywordFilter | Filter muted keywords | LOW |
| AuthorSocialgraphFilter | Filter blocked/muted authors | HIGH |

### Hydrators to Evaluate
| Hydrator | Adds | Priority |
|----------|------|----------|
| CoreDataCandidateHydrator | text, author_id, timestamp | HIGH |
| InNetworkCandidateHydrator | is_in_network bool | HIGH |
| GizmoduckHydrator | author_screen_name, follower_count | MEDIUM |
| VideoDurationCandidateHydrator | video_duration_ms | LOW |
| SubscriptionHydrator | subscription_author_ids | LOW (skip) |
| VFCandidateHydrator | visibility info | MEDIUM |

### Scorers Priority
| Scorer | Purpose | Priority |
|--------|---------|----------|
| PhoenixScorer | ML predictions | HIGH (but simplified) |
| WeightedScorer | Combine predictions | HIGH |
| AuthorDiversityScorer | Author diversity | MEDIUM |
| OONScorer | In-network priority | MEDIUM |

---

## Recommendations from DeepWiki (Answered)

### Essential vs Nice-to-Have Filters

**Absolutely Essential (cannot skip):**
- `DropDuplicatesFilter` - prevent showing same post multiple times
- `CoreDataHydrationFilter` - ensure posts have required metadata
- `AgeFilter` - ensure content freshness
- `SelfTweetFilter` - prevent user seeing own posts
- `VFFilter` (post-selection) - content moderation (spam/violence)

**Nice-to-Have (can skip initially):**
- `RetweetDeduplicationFilter` - dedupe retweets (skip if no retweets)
- `IneligibleSubscriptionFilter` - skip if no subscriptions
- `MutedKeywordFilter` - user keyword filtering
- `PreviouslySeenPostsFilter` - freshness optimization
- `PreviouslyServedPostsFilter` - session deduplication
- `DedupConversationFilter` - thread deduplication

**Impact of skipping:**
- Skipping retweet dedup: might see same retweet multiple times
- Skipping subscription filter: irrelevant if no premium content
- Skipping muted keywords: users see content they'd normally filter
- All safe to skip for MVP

### Hydrator Simplification

**Can Skip:**
- `VideoDurationCandidateHydrator` - if no video content
- `SubscriptionHydrator` - if no premium subscriptions

**Can Replace:**
- `CoreDataCandidateHydrator` (TES) → Query Supabase directly
- `GizmoduckHydrator` (user profiles) → Query Supabase profiles table
- Create `SupabaseCoreDataHydrator` instead

**Minimum Required:**
1. `CoreDataCandidateHydrator` (or Supabase equivalent) - essential for author_id, text
2. `InNetworkCandidateHydrator` - essential for is_in_network flag
3. `GizmoduckHydrator` (optional) - for author follower counts

### Parameter Recommendations (Smaller Scale)

For hundreds of users, thousands of posts:

| Parameter | Recommendation | Reason |
|-----------|----------------|--------|
| `THUNDER_MAX_RESULTS` | 200-500 | Get enough in-network candidates |
| `PHOENIX_MAX_RESULTS` | 200-500 | Get enough OON candidates |
| `RESULT_SIZE` | 20-50 | Standard feed size |
| Total candidates | 400-1000 | Sufficient for thousands of posts corpus |

**When to use thousands:**
- Only needed when corpus is millions of posts
- For thousands of posts, hundreds of candidates is plenty
- Retrieving thousands would mean fetching most/all posts (inefficient)

### Phoenix Ranker Simplification

**Recommendation: Start WITHOUT full transformer**

**Why:**
- Full transformer does "heavy lifting" with engagement history understanding
- Requires candidate isolation attention masking (complex)
- Predicts 16 action types (overkill for MVP)

**MVP Alternative:**
- Use Two-Tower similarity scores only
- Add simple engagement-based boosting
- Skip multi-action predictions initially

**What you'd lose:**
- Complex engagement pattern learning
- Multi-action optimization
- Negative feedback modeling
- Consistent caching (without candidate isolation)

**When to add:**
- Phase 2 after Two-Tower is working
- Can use smaller transformer (not Grok-sized)
- Must implement candidate isolation for consistency

---

## Parameter Values (Our Decisions)

| Parameter | Value | Notes |
|-----------|-------|-------|
| `THUNDER_MAX_RESULTS` | 300 | Balance of in-network content |
| `PHOENIX_MAX_RESULTS` | 300 | Balance of OON discovery |
| `RESULT_SIZE` | 30 | Standard feed size |
| `AUTHOR_DIVERSITY_DECAY` | 0.7 | Standard exponential decay |
| `AUTHOR_DIVERSITY_FLOOR` | 0.3 | Minimum multiplier |
| `OON_WEIGHT_FACTOR` | 0.8 | Slight preference for in-network |

### User Tower Config (Our Decisions)

| Config | Value | Notes |
|--------|-------|-------|
| Layers | 2-4 | Small transformer |
| Attention Heads | 4 | Standard for small models |
| Hidden Dim | 256 | 2x embedding size |
| Max History | 50 | Last 50 engagements |
| Embedding Dim | 128 | As per original |

---

## Final External Services Plan

**Replace with Supabase:**
- ✅ `TESClient` → Supabase posts/likes/follows tables
- ✅ `GizmoduckClient` → Supabase profiles table
- ✅ `StratoClient` → Redis or skip caching initially
- ✅ `Thunder` → Query Supabase for in-network posts

**No external dependencies needed!**

---

## Simplified Implementation Plan

### Phase 1: Core Retrieval Only (MVP)
**Components:**
- Query Hydration (simplified - fetch from Supabase)
- Two-Tower Retrieval (custom implementation)
- Basic Filters: DropDuplicates, Age, PreviouslySeen, AuthorSocialgraph
- Simple Scorer: similarity-based (no ML transformer yet)
- TopK Selection

**Skip for MVP:**
- Phoenix Ranker (transformer)
- Complex filters (RetweetDeduplication, IneligibleSubscription, etc.)
- AuthorDiversityScorer, OONScorer
- External services (use Supabase)

### Phase 2: Add ML Ranking
**Add:**
- Phoenix Ranker (simplified transformer)
- WeightedScorer with 16 action predictions
- AuthorDiversityScorer + OONScorer
- All pre-scoring filters

### Phase 3: Polish
**Add:**
- Post-selection filters
- Video duration, subscription support
- Performance optimizations

---

## Summary

### What We've Verified ✓
- Core two-tower architecture and pipeline flow
- Filter order and execution modes (parallel vs sequential)
- Scorer chain order
- Essential vs nice-to-have components for smaller scale
- Parameter recommendations

### Key Decisions Made
1. **Phase 1 (MVP)**: Two-Tower retrieval only, skip transformer ranker
2. **Filters**: 5 essential filters for MVP, skip the rest
3. **Hydrators**: Use Supabase instead of external services
4. **Candidate counts**: 300+300=600 total → 30 final (appropriate for our scale)
5. **No external dependencies**: All data from Supabase

### Next Steps
1. Design database schema for embeddings
2. Implement Two-Tower User Tower (transformer)
3. Implement Candidate Tower (MLP)
4. Build pipeline with essential filters only
5. Test with real data

---

*Last updated: 2026-02-04*
