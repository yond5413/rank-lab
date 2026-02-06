-- Migration: Create follows table
-- Description: User follows system for Twitter-like functionality
-- Created: 2026-02-02

-- Create the follows table
CREATE TABLE IF NOT EXISTS public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Prevent self-follows and duplicate follows
  CONSTRAINT no_self_follow CHECK (follower_id != following_id),
  UNIQUE(follower_id, following_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows(following_id);
CREATE INDEX IF NOT EXISTS idx_follows_created_at ON public.follows(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE public.follows IS 'User follow relationships';
COMMENT ON COLUMN public.follows.follower_id IS 'User who is following';
COMMENT ON COLUMN public.follows.following_id IS 'User being followed';

-- Enable Row Level Security
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Everyone can read follows (needed to show follower counts)
CREATE POLICY "Follows are viewable by everyone" 
  ON public.follows 
  FOR SELECT 
  USING (true);

-- Users can only insert their own follows
CREATE POLICY "Users can create own follows" 
  ON public.follows 
  FOR INSERT 
  WITH CHECK (auth.uid() = follower_id);

-- Users can only delete their own follows
CREATE POLICY "Users can delete own follows" 
  ON public.follows 
  FOR DELETE 
  USING (auth.uid() = follower_id);

-- Add follower_count and following_count columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS following_count INTEGER DEFAULT 0;

-- Create a function to automatically update profile follower count
CREATE OR REPLACE FUNCTION public.update_profile_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    -- Increment following_count for the follower
    UPDATE public.profiles 
    SET following_count = COALESCE(following_count, 0) + 1
    WHERE id = NEW.follower_id;
    
    -- Increment followers_count for the user being followed
    UPDATE public.profiles 
    SET followers_count = COALESCE(followers_count, 0) + 1
    WHERE id = NEW.following_id;
    
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    -- Decrement following_count for the follower
    UPDATE public.profiles 
    SET following_count = GREATEST(COALESCE(following_count, 0) - 1, 0)
    WHERE id = OLD.follower_id;
    
    -- Decrement followers_count for the user being followed
    UPDATE public.profiles 
    SET followers_count = GREATEST(COALESCE(followers_count, 0) - 1, 0)
    WHERE id = OLD.following_id;
    
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for follow count updates
DROP TRIGGER IF EXISTS update_profile_follow_counts ON public.follows;
CREATE TRIGGER update_profile_follow_counts
  AFTER INSERT OR DELETE ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profile_follow_counts();

-- Create a helper function to check if a user is following another
CREATE OR REPLACE FUNCTION public.is_following(follower_uuid UUID, following_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.follows 
    WHERE follower_id = follower_uuid 
    AND following_id = following_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
