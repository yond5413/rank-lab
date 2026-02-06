-- Add parent_id column to posts table for replies/threads
ALTER TABLE posts 
ADD COLUMN parent_id UUID REFERENCES posts(id) ON DELETE CASCADE;

-- Add index for faster lookups of replies
CREATE INDEX idx_posts_parent_id ON posts(parent_id) WHERE parent_id IS NOT NULL;

-- Update reply_count when a reply is added
CREATE OR REPLACE FUNCTION update_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE posts SET reply_count = COALESCE(reply_count, 0) + 1 WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE posts SET reply_count = GREATEST(COALESCE(reply_count, 0) - 1, 0) WHERE id = OLD.parent_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for reply count updates
DROP TRIGGER IF EXISTS trigger_update_reply_count ON posts;
CREATE TRIGGER trigger_update_reply_count
AFTER INSERT OR DELETE ON posts
FOR EACH ROW
EXECUTE FUNCTION update_reply_count();


