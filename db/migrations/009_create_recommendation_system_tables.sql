-- Migration: Create recommendation system tables
-- Description: Tables for embeddings, scoring weights, and engagement tracking
-- Created: 2026-02-06

-- Create user_embeddings table
CREATE TABLE IF NOT EXISTS public.user_embeddings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  embedding_128 TEXT NOT NULL, -- JSON array of 128 floats
  engagement_count INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create post_embeddings table
CREATE TABLE IF NOT EXISTS public.post_embeddings (
  post_id UUID PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  embedding_128 TEXT NOT NULL, -- JSON array of 128 floats
  base_embedding_384 TEXT, -- MiniLM base embedding (optional)
  is_pretrained BOOLEAN DEFAULT TRUE,
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create scoring_weights table
CREATE TABLE IF NOT EXISTS public.scoring_weights (
  action_type VARCHAR(50) PRIMARY KEY,
  weight FLOAT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create engagement_events table
CREATE TABLE IF NOT EXISTS public.engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create blocks table (for blocked users)
CREATE TABLE IF NOT EXISTS public.blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Prevent self-blocks and duplicate blocks
  CONSTRAINT no_self_block CHECK (blocker_id != blocked_id),
  UNIQUE(blocker_id, blocked_id)
);

-- Create mutes table (for muted users)
CREATE TABLE IF NOT EXISTS public.mutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  muter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  muted_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Prevent self-mutes and duplicate mutes
  CONSTRAINT no_self_mute CHECK (muter_id != muted_id),
  UNIQUE(muter_id, muted_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_user_embeddings_updated_at ON public.user_embeddings(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_embeddings_computed_at ON public.post_embeddings(computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_embeddings_is_pretrained ON public.post_embeddings(is_pretrained);
CREATE INDEX IF NOT EXISTS idx_scoring_weights_is_active ON public.scoring_weights(is_active);
CREATE INDEX IF NOT EXISTS idx_engagement_events_user_id ON public.engagement_events(user_id);
CREATE INDEX IF NOT EXISTS idx_engagement_events_post_id ON public.engagement_events(post_id);
CREATE INDEX IF NOT EXISTS idx_engagement_events_event_type ON public.engagement_events(event_type);
CREATE INDEX IF NOT EXISTS idx_engagement_events_created_at ON public.engagement_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blocks_blocker_id ON public.blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked_id ON public.blocks(blocked_id);
CREATE INDEX IF NOT EXISTS idx_mutes_muter_id ON public.mutes(muter_id);
CREATE INDEX IF NOT EXISTS idx_mutes_muted_id ON public.mutes(muted_id);

-- Add comments for documentation
COMMENT ON TABLE public.user_embeddings IS 'User embeddings for recommendation system';
COMMENT ON TABLE public.post_embeddings IS 'Post embeddings for recommendation system';
COMMENT ON TABLE public.scoring_weights IS 'Configurable weights for action scoring';
COMMENT ON TABLE public.engagement_events IS 'User engagement events for training';
COMMENT ON TABLE public.blocks IS 'User block relationships';
COMMENT ON TABLE public.mutes IS 'User mute relationships';

-- Enable Row Level Security
ALTER TABLE public.user_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scoring_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutes ENABLE ROW LEVEL SECURITY;

-- Create policies for user_embeddings
CREATE POLICY "User embeddings viewable by service" 
  ON public.user_embeddings 
  FOR SELECT 
  USING (auth.role() = 'service_role' OR auth.uid() = user_id);

CREATE POLICY "Service can manage user embeddings" 
  ON public.user_embeddings 
  FOR ALL 
  USING (auth.role() = 'service_role');

-- Create policies for post_embeddings
CREATE POLICY "Post embeddings viewable by service" 
  ON public.post_embeddings 
  FOR SELECT 
  USING (auth.role() = 'service_role');

CREATE POLICY "Service can manage post embeddings" 
  ON public.post_embeddings 
  FOR ALL 
  USING (auth.role() = 'service_role');

-- Create policies for scoring_weights
CREATE POLICY "Scoring weights viewable by authenticated users" 
  ON public.scoring_weights 
  FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service can manage scoring weights" 
  ON public.scoring_weights 
  FOR ALL 
  USING (auth.role() = 'service_role');

-- Create policies for engagement_events
CREATE POLICY "Users can view own engagement events" 
  ON public.engagement_events 
  FOR SELECT 
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can create own engagement events" 
  ON public.engagement_events 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

-- Create policies for blocks
CREATE POLICY "Users can view own blocks" 
  ON public.blocks 
  FOR SELECT 
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users can create own blocks" 
  ON public.blocks 
  FOR INSERT 
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can delete own blocks" 
  ON public.blocks 
  FOR DELETE 
  USING (auth.uid() = blocker_id);

-- Create policies for mutes
CREATE POLICY "Users can view own mutes" 
  ON public.mutes 
  FOR SELECT 
  USING (auth.uid() = muter_id);

CREATE POLICY "Users can create own mutes" 
  ON public.mutes 
  FOR INSERT 
  WITH CHECK (auth.uid() = muter_id);

CREATE POLICY "Users can delete own mutes" 
  ON public.mutes 
  FOR DELETE 
  USING (auth.uid() = muter_id);

-- Insert default scoring weights
INSERT INTO public.scoring_weights (action_type, weight, description) VALUES
  ('like', 1.0, 'User likes the post'),
  ('reply', 1.2, 'User replies to post'),
  ('repost', 1.0, 'User reposts/retweets'),
  ('not_interested', -2.0, 'User marks not interested'),
  ('block_author', -10.0, 'User blocks author'),
  ('mute_author', -5.0, 'User mutes author')
ON CONFLICT (action_type) DO NOTHING;