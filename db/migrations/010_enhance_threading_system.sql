-- Migration: Enhance threading system with depth tracking
-- Description: Add thread depth column and recursive thread traversal functions
-- Created: 2026-02-06

-- Add thread_depth column to posts table for efficient querying
ALTER TABLE posts 
ADD COLUMN thread_depth INTEGER DEFAULT 0;

-- Add root_post_id to quickly find the top-level post of any thread
ALTER TABLE posts 
ADD COLUMN root_post_id UUID;

-- Create index for efficient thread queries
CREATE INDEX idx_posts_thread_depth ON posts(thread_depth);
CREATE INDEX idx_posts_root_post_id ON posts(root_post_id) WHERE root_post_id IS NOT NULL;
CREATE INDEX idx_posts_thread_traversal ON posts(root_post_id, thread_depth, created_at);

-- Function to calculate thread depth and root post ID
CREATE OR REPLACE FUNCTION calculate_thread_info(post_parent_id UUID)
RETURNS TABLE(depth INTEGER, root_id UUID) AS $$
BEGIN
  -- If no parent, this is a top-level post
  IF post_parent_id IS NULL THEN
    RETURN QUERY SELECT 0, NULL::UUID;
    RETURN;
  END IF;
  
  -- Recursively find the depth and root
  WITH RECURSIVE thread_path AS (
    -- Base case: direct parent
    SELECT 
      p.id,
      p.parent_id,
      p.root_post_id,
      1 as depth
    FROM posts p 
    WHERE p.id = post_parent_id
    
    UNION ALL
    
    -- Recursive case: traverse up the chain
    SELECT 
      p.id,
      p.parent_id,
      p.root_post_id,
      tp.depth + 1
    FROM posts p
    JOIN thread_path tp ON p.id = tp.parent_id
    WHERE p.parent_id IS NOT NULL
  )
  SELECT 
    COALESCE(MAX(tp.depth), 1),
    COALESCE(
      (SELECT tp.root_post_id FROM thread_path tp WHERE tp.parent_id IS NULL LIMIT 1),
      (SELECT tp.id FROM thread_path tp WHERE tp.parent_id IS NULL LIMIT 1),
      post_parent_id
    )
  FROM thread_path tp
  INTO depth, root_id;
  
  RETURN QUERY SELECT depth, root_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update thread info when a post is inserted or updated
CREATE OR REPLACE FUNCTION update_thread_info()
RETURNS TRIGGER AS $$
DECLARE
  thread_info RECORD;
BEGIN
  -- Calculate thread depth and root post ID
  SELECT * INTO thread_info FROM calculate_thread_info(NEW.parent_id);
  
  -- Update the new post with calculated values
  NEW.thread_depth = thread_info.depth;
  NEW.root_post_id = thread_info.root_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for thread info updates
DROP TRIGGER IF EXISTS trigger_update_thread_info ON posts;
CREATE TRIGGER trigger_update_thread_info
BEFORE INSERT OR UPDATE ON posts
FOR EACH ROW
EXECUTE FUNCTION update_thread_info();

-- Function to get all replies in a thread with proper ordering
CREATE OR REPLACE FUNCTION get_thread_replies(root_id UUID, max_depth INTEGER DEFAULT 10)
RETURNS TABLE(
  id UUID,
  parent_id UUID,
  thread_depth INTEGER,
  content TEXT,
  author_id UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  likes_count INTEGER,
  reply_count INTEGER,
  thread_path INTEGER[]
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE thread_tree AS (
    -- Base case: root post
    SELECT 
      p.id,
      p.parent_id,
      p.thread_depth,
      p.content,
      p.author_id,
      p.created_at,
      p.likes_count,
      p.reply_count,
      ARRAY[ROW_NUMBER() OVER (ORDER BY p.created_at)]::INTEGER[] as path
    FROM posts p 
    WHERE p.id = root_id OR p.root_post_id = root_id
    AND p.thread_depth = 0
    
    UNION ALL
    
    -- Recursive case: get replies
    SELECT 
      p.id,
      p.parent_id,
      p.thread_depth,
      p.content,
      p.author_id,
      p.created_at,
      p.likes_count,
      p.reply_count,
      tt.path || ROW_NUMBER() OVER (ORDER BY p.created_at)
    FROM posts p
    JOIN thread_tree tt ON p.parent_id = tt.id
    WHERE p.thread_depth <= max_depth
  )
  SELECT 
    tt.id,
    tt.parent_id,
    tt.thread_depth,
    tt.content,
    tt.author_id,
    tt.created_at,
    tt.likes_count,
    tt.reply_count,
    tt.path
  FROM thread_tree tt
  ORDER BY tt.path;
END;
$$ LANGUAGE plpgsql;

-- Function to get thread statistics
CREATE OR REPLACE FUNCTION get_thread_stats(post_id UUID)
RETURNS TABLE(
  total_replies INTEGER,
  max_depth INTEGER,
  participant_count INTEGER,
  root_post_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER - 1 as total_replies, -- Exclude the root post
    MAX(p.thread_depth)::INTEGER as max_depth,
    COUNT(DISTINCT p.author_id)::INTEGER as participant_count,
    COALESCE(p.root_post_id, post_id) as root_id
  FROM posts p
  WHERE p.id = post_id 
     OR p.root_post_id = (
       SELECT COALESCE(root_post_id, id) 
       FROM posts 
       WHERE id = post_id
     );
END;
$$ LANGUAGE plpgsql;

-- Backfill existing posts with thread info
DO $$
DECLARE
  post_record RECORD;
  thread_info RECORD;
BEGIN
  -- Update all existing posts with proper thread info
  FOR post_record IN SELECT id, parent_id FROM posts ORDER BY created_at LOOP
    SELECT * INTO thread_info FROM calculate_thread_info(post_record.parent_id);
    
    UPDATE posts 
    SET 
      thread_depth = thread_info.depth,
      root_post_id = thread_info.root_id
    WHERE id = post_record.id;
  END LOOP;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN posts.thread_depth IS 'Depth of post in thread (0 = top-level, 1 = direct reply, etc.)';
COMMENT ON COLUMN posts.root_post_id IS 'ID of the top-level post in this thread (NULL for top-level posts)';
COMMENT ON FUNCTION get_thread_replies(UUID, INTEGER) IS 'Recursively gets all replies in a thread with proper ordering';
COMMENT ON FUNCTION get_thread_stats(UUID) IS 'Returns statistics about a thread (reply count, depth, participants)';