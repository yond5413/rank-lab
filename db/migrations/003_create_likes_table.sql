-- Migration: Create likes table
-- Description: Likes/junction table for post likes
-- Created: 2026-02-01

-- Create the likes table
CREATE TABLE IF NOT EXISTS public.likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Prevent duplicate likes (one user can only like a post once)
  UNIQUE(post_id, user_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON public.likes(post_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON public.likes(user_id);
CREATE INDEX IF NOT EXISTS idx_likes_created_at ON public.likes(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE public.likes IS 'User likes on posts';
COMMENT ON COLUMN public.likes.post_id IS 'References posts.id';
COMMENT ON COLUMN public.likes.user_id IS 'References profiles.id';

-- Enable Row Level Security
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Everyone can read likes (needed to show like counts)
CREATE POLICY "Likes are viewable by everyone" 
  ON public.likes 
  FOR SELECT 
  USING (true);

-- Users can only insert their own likes
CREATE POLICY "Users can create own likes" 
  ON public.likes 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own likes
CREATE POLICY "Users can delete own likes" 
  ON public.likes 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Add a likes_count column to posts for better performance
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0;

-- Create a function to automatically update post like count
CREATE OR REPLACE FUNCTION public.update_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.posts 
    SET likes_count = likes_count + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.posts 
    SET likes_count = likes_count - 1
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for like count updates
DROP TRIGGER IF EXISTS update_post_like_count ON public.likes;
CREATE TRIGGER update_post_like_count
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_like_count();
