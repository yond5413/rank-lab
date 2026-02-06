-- Migration: Create bookmarks table
-- Description: Bookmarks/junction table for saved posts
-- Created: 2026-02-06

-- Create the bookmarks table
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Prevent duplicate bookmarks (one user can only bookmark a post once)
  UNIQUE(post_id, user_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_bookmarks_post_id ON public.bookmarks(post_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON public.bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_created_at ON public.bookmarks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created ON public.bookmarks(user_id, created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE public.bookmarks IS 'User bookmarks on posts for saving content';
COMMENT ON COLUMN public.bookmarks.post_id IS 'References posts.id';
COMMENT ON COLUMN public.bookmarks.user_id IS 'References profiles.id';

-- Enable Row Level Security
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Users can only view their own bookmarks (privacy-focused unlike likes)
CREATE POLICY "Users can view own bookmarks" 
  ON public.bookmarks 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Users can only insert their own bookmarks
CREATE POLICY "Users can create own bookmarks" 
  ON public.bookmarks 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own bookmarks
CREATE POLICY "Users can delete own bookmarks" 
  ON public.bookmarks 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Add a bookmarks_count column to posts for analytics (optional)
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS bookmarks_count INTEGER DEFAULT 0;

-- Create a function to automatically update post bookmark count
CREATE OR REPLACE FUNCTION public.update_post_bookmark_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.posts 
    SET bookmarks_count = bookmarks_count + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.posts 
    SET bookmarks_count = GREATEST(bookmarks_count - 1, 0)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for bookmark count updates
DROP TRIGGER IF EXISTS update_post_bookmark_count ON public.bookmarks;
CREATE TRIGGER update_post_bookmark_count
  AFTER INSERT OR DELETE ON public.bookmarks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_bookmark_count();

-- Create a view for user bookmarks with post details
CREATE OR REPLACE VIEW public.user_bookmarks AS
SELECT 
  b.id as bookmark_id,
  b.user_id,
  b.created_at as bookmarked_at,
  p.id as post_id,
  p.author_id,
  p.content,
  p.created_at as post_created_at,
  p.likes_count,
  p.reply_count,
  p.repost_count,
  p.view_count,
  p.thread_depth,
  p.root_post_id,
  pr.display_name as author_name,
  pr.username as author_username,
  pr.avatar_url as author_avatar
FROM public.bookmarks b
JOIN public.posts p ON b.post_id = p.id
JOIN public.profiles pr ON p.author_id = pr.id
ORDER BY b.created_at DESC;

-- Add RLS to the view
ALTER VIEW public.user_bookmarks SET (security_invoker = true);

-- Grant permissions for the bookmarks table
GRANT SELECT, INSERT, DELETE ON public.bookmarks TO authenticated;
GRANT SELECT ON public.user_bookmarks TO authenticated;