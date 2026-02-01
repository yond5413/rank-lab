-- Migration: Create posts table
-- Description: Posts table for the social feed
-- Created: 2026-02-01

-- Create the posts table
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) <= 280),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reply_count INTEGER DEFAULT 0,
  repost_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_posts_author_id ON public.posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON public.posts(author_id, created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE public.posts IS 'Social feed posts';
COMMENT ON COLUMN public.posts.author_id IS 'References profiles.id';
COMMENT ON COLUMN public.posts.content IS 'Post content (max 280 chars)';
COMMENT ON COLUMN public.posts.reply_count IS 'Number of replies (cached)';
COMMENT ON COLUMN public.posts.repost_count IS 'Number of reposts (cached)';
COMMENT ON COLUMN public.posts.view_count IS 'Number of views (cached)';

-- Enable Row Level Security
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Everyone can read all posts
CREATE POLICY "Posts are viewable by everyone" 
  ON public.posts 
  FOR SELECT 
  USING (true);

-- Users can only insert their own posts
CREATE POLICY "Users can create posts" 
  ON public.posts 
  FOR INSERT 
  WITH CHECK (auth.uid() = author_id);

-- Users can only update their own posts
CREATE POLICY "Users can update own posts" 
  ON public.posts 
  FOR UPDATE 
  USING (auth.uid() = author_id);

-- Users can only delete their own posts
CREATE POLICY "Users can delete own posts" 
  ON public.posts 
  FOR DELETE 
  USING (auth.uid() = author_id);

-- Create a function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at on posts
DROP TRIGGER IF EXISTS update_posts_updated_at ON public.posts;
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
