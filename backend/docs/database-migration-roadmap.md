# Database Migration Roadmap for X-Algorithm Implementation

> Complete schema changes required for all three phases of the recommendation system implementation.

---

## Overview

This document outlines the database schema migrations needed to support the x-algorithm-based recommendation system. The migrations are designed to be **progressive** - you can add them incrementally as you implement each phase, but adding them all upfront allows for silent data collection and future-proofing.

**Current Schema Status:** ✅ Solid foundation (profiles, posts, likes, follows, replies)
**Additional Migrations Needed:** 3 core migrations
**Estimated Time to Apply:** 5 minutes total
**Breaking Changes:** None (all additive)

---

## Migration Inventory

### Already Implemented (✅)

| Migration | Purpose | Recommendation System Relevance |
|-----------|---------|--------------------------------|
| `001_create_profiles_table.sql` | User profiles | ✅ Core entity - used for user features |
| `002_create_posts_table.sql` | Posts table | ✅ Core entity - content + engagement counts |
| `003_create_likes_table.sql` | Likes tracking | ✅ Primary engagement signal |
| `004_add_seed_data.sql` | Sample data | ✅ Testing/development |
| `005_add_parent_id_to_posts.sql` | Replies | ✅ Thread support |
| `006_create_follows_table.sql` | Follow relationships | ✅ In-network content filtering |

### New Migrations Needed

| Migration | Phase | Purpose | Priority |
|-----------|-------|---------|----------|
| `007_add_post_embeddings.sql` | Phase 1+ | Store pre-computed embeddings | 🔴 Critical - needed immediately |
| `008_add_engagement_events.sql` | Phase 2+ | Comprehensive engagement tracking | 🟡 Important - start collecting now |
| `009_add_training_data_tables.sql` | Phase 2+ | Training pair storage | 🟢 Future-proofing - can be empty initially |

---

## Migration 007: Post Embeddings (Phase 1)

**File:** `db/migrations/007_add_post_embeddings.sql`

**Purpose:** Store pre-computed text embeddings for fast similarity search

**Why This Matters:**
- Computing embeddings on-the-fly takes 50-200ms per post
- With 1000+ posts, this becomes 50-200 seconds (unacceptable)
- Pre-computation allows sub-second recommendation generation
- Enables vector similarity search (if pgvector enabled)

**Schema Changes:**

```sql
-- Add embedding columns to posts table
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS embedding_384 TEXT,  -- Base embedding (MiniLM)
ADD COLUMN IF NOT EXISTS embedding_256 TEXT,  -- Projected embedding (learned)
ADD COLUMN IF NOT EXISTS computed_at TIMESTAMP;  -- When embedding was calculated

-- Track when user embeddings were last updated
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS user_embedding_256 TEXT,
ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMP;

-- Index for finding posts without embeddings (for batch processing)
CREATE INDEX IF NOT EXISTS idx_posts_needs_embedding 
ON posts(computed_at) 
WHERE computed_at IS NULL;

-- Index for finding recently computed embeddings (for caching)
CREATE INDEX IF NOT EXISTS idx_posts_computed_at 
ON posts(computed_at DESC) 
WHERE computed_at IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN posts.embedding_384 IS 'Pre-computed 384-dim text embedding (JSON array)';
COMMENT ON COLUMN posts.embedding_256 IS 'Learned 256-dim embedding after projection (JSON array)';
COMMENT ON COLUMN posts.computed_at IS 'Timestamp when embeddings were computed';
```

**Storage Considerations:**
- `embedding_384`: ~2KB per post (384 floats × 4 bytes)
- `embedding_256`: ~1KB per post (256 floats × 4 bytes)
- For 10,000 posts: ~30MB total (negligible)

**When to Apply:** 🔴 **Immediately** - Required for Phase 1

---

## Migration 008: Comprehensive Engagement Events (Phase 2)

**File:** `db/migrations/008_add_engagement_events.sql`

**Purpose:** Track all 12 engagement types for training data collection

**Why This Matters:**
- Current schema only tracks likes explicitly
- X-algorithm weights 12 different engagement types differently
- Need negative signals (not_interested, block, mute)
- Dwell time (view duration) is a critical implicit signal
- Training data requires knowing WHAT was shown and HOW user interacted

**Current Gaps:**
- ✅ Likes (tracked in `likes` table)
- ⚠️ Views (have `view_count` column but no `post_views` table)
- ❌ Replies (tracked in `posts.parent_id`, but not as explicit events)
- ❌ Reposts (have `repost_count` but no `reposts` table)
- ❌ Click events (not tracked)
- ❌ Dwell time (not tracked)
- ❌ Negative signals (not_interested, block, mute - not tracked)

**Schema Changes:**

```sql
-- Comprehensive engagement events table
-- This captures EVERY interaction for training data
CREATE TABLE IF NOT EXISTS engagement_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    
    -- Event classification
    event_type VARCHAR(50) NOT NULL CHECK (
        event_type IN (
            'like',           -- User clicked like button
            'reply',          -- User replied to post  
            'repost',         -- User reposted/retweeted
            'view',           -- Post appeared in user's viewport
            'click',          -- User clicked to expand/details
            'share',          -- User shared externally
            'profile_click',  -- User clicked author profile
            'dwell',          -- User spent time viewing (implicit)
            'not_interested', -- User marked not interested (explicit negative)
            'block_author',   -- User blocked author (strong negative)
            'mute_author',    -- User muted author (negative)
            'report'          -- User reported post (strong negative)
        )
    ),
    
    -- Engagement metadata
    dwell_time_ms INTEGER,              -- How long post was in view (for 'dwell' events)
    position_in_feed INTEGER,           -- Where post appeared (0-indexed)
    predicted_score FLOAT,                -- What model predicted at serve time
    
    -- Context (for debugging/analysis)
    feed_algorithm VARCHAR(50),         -- Which algorithm version served this
    device_type VARCHAR(20),            -- mobile/desktop (for analysis)
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate events of same type
    UNIQUE(user_id, post_id, event_type)
);

-- Indexes for training data queries
CREATE INDEX IF NOT EXISTS idx_engagement_user_time 
ON engagement_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_engagement_post 
ON engagement_events(post_id);

CREATE INDEX IF NOT EXISTS idx_engagement_type 
ON engagement_events(event_type);

CREATE INDEX IF NOT EXISTS idx_engagement_positive 
ON engagement_events(user_id, post_id) 
WHERE event_type IN ('like', 'reply', 'repost', 'click', 'share');

-- Index for finding recent views (for calculating dwell time)
CREATE INDEX IF NOT EXISTS idx_engagement_views 
ON engagement_events(user_id, post_id, created_at) 
WHERE event_type = 'view';

-- Row Level Security
ALTER TABLE engagement_events ENABLE ROW LEVEL SECURITY;

-- Everyone can read (for public analytics)
CREATE POLICY "Engagement events are viewable by everyone" 
ON engagement_events FOR SELECT USING (true);

-- Only system can insert (via backend service)
CREATE POLICY "Only authenticated service can create engagement events" 
ON engagement_events FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Comments for documentation
COMMENT ON TABLE engagement_events IS 'Comprehensive engagement tracking for ML training';
COMMENT ON COLUMN engagement_events.event_type IS 'Type of user interaction';
COMMENT ON COLUMN engagement_events.dwell_time_ms IS 'Time in milliseconds post was in viewport';
COMMENT ON COLUMN engagement_events.position_in_feed IS 'Position when shown (0 = first)';
COMMENT ON COLUMN engagement_events.predicted_score IS 'Model prediction at time of serving';
```

**Additional Supporting Tables:**

```sql
-- Post views table (if not already tracking individual views)
-- This is needed because view_count on posts is just a counter, 
-- we need WHO viewed it for training
CREATE TABLE IF NOT EXISTS post_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(post_id, user_id)  -- One view per user per post
);

-- Index for checking if user viewed a post
CREATE INDEX IF NOT EXISTS idx_post_views_user_post 
ON post_views(user_id, post_id);

-- Index for finding viewers of a post
CREATE INDEX IF NOT EXISTS idx_post_views_post 
ON post_views(post_id);

-- Trigger to update view_count on posts table
CREATE OR REPLACE FUNCTION update_view_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE posts 
    SET view_count = COALESCE(view_count, 0) + 1 
    WHERE id = NEW.post_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_view_count ON post_views;
CREATE TRIGGER trigger_update_view_count
    AFTER INSERT ON post_views
    FOR EACH ROW EXECUTE FUNCTION update_view_count();

-- Reposts table (explicit repost tracking)
CREATE TABLE IF NOT EXISTS reposts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

-- Trigger to update repost_count
CREATE OR REPLACE FUNCTION update_repost_count()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE posts SET repost_count = COALESCE(repost_count, 0) + 1 WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE posts SET repost_count = GREATEST(COALESCE(repost_count, 0) - 1, 0) WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_repost_count ON reposts;
CREATE TRIGGER trigger_update_repost_count
    AFTER INSERT OR DELETE ON reposts
    FOR EACH ROW EXECUTE FUNCTION update_repost_count();
```

**Storage Considerations:**
- Engagement events grow rapidly: ~50-200 events per user per day
- For 100 active users: ~15,000 events/day = ~450K events/month
- Each event: ~200 bytes → 90MB/month (manageable)
- **Recommendation:** Set up retention policy (keep 90 days of events)

**When to Apply:** 🟡 **Before Phase 2** - Start collecting data silently now, use it later

**Silent Data Collection Strategy (Can Start Now):**
```javascript
// In your frontend, whenever a post is shown:
await supabase.from('engagement_events').insert({
    user_id: currentUser.id,
    post_id: post.id,
    event_type: 'view',
    position_in_feed: index
});

// When user likes:
await supabase.from('engagement_events').insert({
    user_id: currentUser.id,
    post_id: post.id,
    event_type: 'like',
    position_in_feed: index,
    // You don't have predicted_score yet in Phase 1
});
```

---

## Migration 009: Training Data Tables (Phase 2+)

**File:** `db/migrations/009_add_training_data_tables.sql`

**Purpose:** Store labeled training pairs for the Two-Tower model

**Why This Matters:**
- Training requires (user, post, label) triplets
- Label = 1 if user engaged, 0 if shown but didn't engage (negative sampling)
- Need snapshots of user history at time of interaction
- Embeddings change over time (need frozen snapshots for training)

**Schema Changes:**

```sql
-- Main training pairs table
-- Stores positive and negative examples for model training
CREATE TABLE IF NOT EXISTS training_pairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Entities
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    
    -- User context snapshot (at time of interaction)
    -- Stores user's recent engagement history as JSON
    user_history_snapshot JSONB,  -- {
                                  --   "recent_posts": [...],
                                  --   "recent_likes": [...],
                                  --   "embedding": [...]
                                  -- }
    
    -- Post context snapshot
    post_content_snapshot TEXT,     -- Post content at time of training
    post_embedding_snapshot TEXT,   -- 384-dim embedding (JSON array)
    post_metadata_snapshot JSONB,   -- {likes_count, reply_count, created_at}
    
    -- Label (what we're predicting)
    label BOOLEAN NOT NULL,  -- TRUE: user engaged with this post
                            -- FALSE: shown but didn't engage (negative sample)
    
    -- Engagement details (for multi-task learning)
    engagement_type VARCHAR(50),  -- If label=TRUE, what type: 'like', 'reply', etc.
    dwell_time_ms INTEGER,        -- If available
    
    -- Model metadata
    algorithm_version VARCHAR(50),  -- Which model version generated this training pair
    
    -- Timestamps
    interaction_at TIMESTAMP WITH TIME ZONE,  -- When the interaction happened
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one training pair per user-post combination per algorithm version
    UNIQUE(user_id, post_id, algorithm_version)
);

-- Indexes for training data queries
CREATE INDEX IF NOT EXISTS idx_training_pairs_user 
ON training_pairs(user_id);

CREATE INDEX IF NOT EXISTS idx_training_pairs_label 
ON training_pairs(label);

CREATE INDEX IF NOT EXISTS idx_training_pairs_interaction 
ON training_pairs(interaction_at DESC);

-- Index for fetching recent positive/negative pairs
CREATE INDEX IF NOT EXISTS idx_training_pairs_recent 
ON training_pairs(created_at DESC) 
WHERE created_at > NOW() - INTERVAL '7 days';

-- Row Level Security
ALTER TABLE training_pairs ENABLE ROW LEVEL SECURITY;

-- Only service account should access training data
CREATE POLICY "Training pairs restricted to service" 
ON training_pairs FOR ALL 
USING (false);  -- Deny all by default, enable via service role

-- Comments
COMMENT ON TABLE training_pairs IS 'Labeled training data for Two-Tower model';
COMMENT ON COLUMN training_pairs.label IS '1 = user engaged, 0 = negative sample';
COMMENT ON COLUMN training_pairs.user_history_snapshot IS 'User context at time of interaction';
```

**Additional Training Metadata:**

```sql
-- Track model versions and their performance
CREATE TABLE IF NOT EXISTS model_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(50) UNIQUE NOT NULL,
    model_type VARCHAR(50) NOT NULL,  -- 'two_tower', 'transformer_ranker'
    training_start_at TIMESTAMP WITH TIME ZONE,
    training_end_at TIMESTAMP WITH TIME ZONE,
    num_training_samples INTEGER,
    validation_loss FLOAT,
    accuracy FLOAT,
    model_weights_url TEXT,  -- URL to stored model weights
    is_active BOOLEAN DEFAULT FALSE,  -- Currently deployed?
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track which training pairs were used for which model
CREATE TABLE IF NOT EXISTS training_pair_models (
    training_pair_id UUID REFERENCES training_pairs(id) ON DELETE CASCADE,
    model_version_id UUID REFERENCES model_versions(id) ON DELETE CASCADE,
    loss FLOAT,  -- Loss for this specific sample
    PRIMARY KEY (training_pair_id, model_version_id)
);
```

**Storage Considerations:**
- Each training pair: ~5KB (embeddings + metadata)
- For 1000 training pairs: ~5MB (minimal)
- Can be pruned after model is trained (keep only recent)

**When to Apply:** 🟢 **Anytime before Phase 2** - Can remain empty, used later

**How to Populate (When Ready):**

```python
# Training data generation script

def generate_training_pairs(user_id, lookback_days=30):
    """
    For each user, generate:
    - Positive pairs: (user, posts they engaged with)
    - Negative pairs: (user, posts they viewed but didn't engage)
    """
    
    # Get user's engagement history
    engagements = supabase.table('engagement_events') \
        .select('*') \
        .eq('user_id', user_id) \
        .gte('created_at', f'NOW() - INTERVAL \'{lookback_days} days\'') \
        .execute()
    
    # Get user's views (potential negatives)
    views = supabase.table('engagement_events') \
        .select('*') \
        .eq('user_id', user_id) \
        .eq('event_type', 'view') \
        .execute()
    
    positive_pairs = []
    negative_pairs = []
    
    # Create positive pairs from engagements
    for engagement in engagements.data:
        if engagement['event_type'] in ['like', 'reply', 'repost']:
            # Get post snapshot
            post = get_post_at_time(engagement['post_id'], engagement['created_at'])
            
            # Get user history snapshot
            user_history = get_user_history_at_time(user_id, engagement['created_at'])
            
            positive_pairs.append({
                'user_id': user_id,
                'post_id': engagement['post_id'],
                'user_history_snapshot': json.dumps(user_history),
                'post_embedding_snapshot': post['embedding_384'],
                'label': True,
                'engagement_type': engagement['event_type'],
                'interaction_at': engagement['created_at']
            })
    
    # Create negative pairs (views without engagement)
    viewed_post_ids = {v['post_id'] for v in views.data}
    engaged_post_ids = {e['post_id'] for e in engagements.data 
                       if e['event_type'] in ['like', 'reply', 'repost']}
    
    negative_post_ids = viewed_post_ids - engaged_post_ids
    
    for post_id in list(negative_post_ids)[:len(positive_pairs) * 5]:  # 5:1 ratio
        post = get_post_at_time(post_id, None)
        user_history = get_user_history_at_time(user_id, None)
        
        negative_pairs.append({
            'user_id': user_id,
            'post_id': post_id,
            'user_history_snapshot': json.dumps(user_history),
            'post_embedding_snapshot': post['embedding_384'],
            'label': False,
            'interaction_at': views.data[0]['created_at']  # Approximate
        })
    
    return positive_pairs + negative_pairs
```

---

## Migration Application Order

### **Recommended Sequence:**

**Week 1 (Phase 1 Setup):**
```bash
# Apply immediately
007_add_post_embeddings.sql          # Required for Phase 1
```

**Week 2 (Background Data Collection):**
```bash
# Apply while building Phase 1
008_add_engagement_events.sql          # Start collecting data silently
```

**Week 3-4 (Phase 2 Preparation):**
```bash
# Apply when ready to start Phase 2
009_add_training_data_tables.sql     # Ready for model training
```

### **Alternative: Apply All At Once**
```bash
# If you want future-proof schema immediately:
supabase db push 007_add_post_embeddings.sql
supabase db push 008_add_engagement_events.sql
supabase db push 009_add_training_data_tables.sql
```

**Benefits of All-At-Once:**
- ✅ Single migration window
- ✅ Start collecting engagement data immediately
- ✅ No future schema interruptions
- ✅ Complete data history from day one

---

## Testing Your Schema

After applying migrations, verify with:

```sql
-- Test 1: Can store embeddings
UPDATE posts 
SET embedding_384 = '[0.1, 0.2, 0.3, ...]',  -- 384 numbers
    computed_at = NOW()
WHERE id = 'your-post-id';

-- Test 2: Can log engagement
INSERT INTO engagement_events (user_id, post_id, event_type, position_in_feed)
VALUES ('user-uuid', 'post-uuid', 'view', 0);

-- Test 3: Can create training pair
INSERT INTO training_pairs (
    user_id, post_id, user_history_snapshot, 
    post_embedding_snapshot, label, interaction_at
) VALUES (
    'user-uuid', 
    'post-uuid',
    '{"recent_posts": ["post1", "post2"]}',
    '[0.1, 0.2, ...]',
    true,
    NOW()
);
```

---

## Data Retention & Cleanup

**Recommendation:** Implement cleanup jobs

```sql
-- Keep only 90 days of engagement events (older = less relevant for training)
CREATE OR REPLACE FUNCTION cleanup_old_engagement_events()
RETURNS void AS $$
BEGIN
    DELETE FROM engagement_events 
    WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Keep only trained-on data
CREATE OR REPLACE FUNCTION cleanup_old_training_pairs()
RETURNS void AS $$
BEGIN
    DELETE FROM training_pairs 
    WHERE created_at < NOW() - INTERVAL '30 days'
    AND id IN (
        SELECT training_pair_id FROM training_pair_models
    );
END;
$$ LANGUAGE plpgsql;
```

---

## Summary

| Migration | When to Apply | Can Be Empty? | Purpose |
|-----------|--------------|---------------|---------|
| `007_add_post_embeddings.sql` | 🔴 **Now** | ❌ No | Store embeddings for fast similarity search |
| `008_add_engagement_events.sql` | 🟡 **This week** | ⚠️ Should collect data | Comprehensive interaction tracking |
| `009_add_training_data_tables.sql` | 🟢 **Anytime** | ✅ Yes | Store labeled training pairs |

**Next Steps:**
1. ✅ Review these migration specs
2. ✅ Choose application order (incremental vs all-at-once)
3. ✅ Apply migrations
4. ✅ Verify with test queries
5. ✅ Update frontend to log engagement_events (if applying 008)

**Questions to Consider:**
- Do you want to apply all 3 now, or incrementally?
- Should I create the actual SQL files for you to review?
- Do you need pgvector extension enabled for vector operations?

---

*These migrations provide the foundation for all three implementation phases while maintaining backward compatibility with your existing schema.*
