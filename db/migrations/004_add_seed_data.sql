-- Migration: Add seed data
-- Description: Seed the database with initial users and posts
-- Created: 2026-02-01

-- Note: This migration assumes you want sample data.
-- To use this, manually create users via Supabase Auth dashboard first,
-- then note their UUIDs and replace the placeholder UUIDs below.

-- For now, we'll add this as a reference/template for seeding.
-- Uncomment and modify UUIDs when you have real user accounts.

/*
-- Example seed posts (replace with actual user UUIDs from auth.users)
INSERT INTO public.posts (id, author_id, content, created_at, likes_count, reply_count, repost_count, view_count) VALUES
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000001', -- Replace with actual user UUID
    'Just started working on a new project using Next.js and shadcn/ui. The development experience is amazing! 🚀 #webdev #react',
    NOW() - INTERVAL '5 minutes',
    42, 12, 8, 1250
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000002', -- Replace with actual user UUID
    'Exploring new AI tools for developers. The possibilities are endless!',
    NOW() - INTERVAL '30 minutes',
    128, 45, 24, 3200
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000003', -- Replace with actual user UUID
    'Hot take: TypeScript should be the default for all new JavaScript projects. The type safety saves countless hours of debugging.',
    NOW() - INTERVAL '1 hour',
    256, 134, 89, 8500
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000004', -- Replace with actual user UUID
    'Just shipped my first full-stack app with Supabase. The built-in auth and real-time features are game changers! 🎉',
    NOW() - INTERVAL '2 hours',
    89, 23, 15, 2100
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000005', -- Replace with actual user UUID
    'Remember: every expert was once a beginner. Keep learning, keep building, keep shipping! 💪 #motivation #coding',
    NOW() - INTERVAL '4 hours',
    512, 89, 156, 12000
  );
*/

-- Instead, let's add a helper function to get the current user ID (useful for queries)
CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add a function to check if the current user has liked a post
CREATE OR REPLACE FUNCTION public.has_user_liked_post(post_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.likes 
    WHERE post_id = post_uuid 
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
