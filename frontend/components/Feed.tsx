import { createClient } from '@/lib/supabase/server'
import type { PostData } from '@/types/post'
import type { Tables } from '@/types/database'
import { FeedContent } from './FeedContent'

interface PostWithProfile extends Tables<'posts'> {
  profiles: {
    display_name: string
    username: string
    avatar_url: string | null
  } | null
}

async function getPosts(userId?: string, feedType: 'all' | 'following' = 'all'): Promise<PostData[]> {
  const supabase = await createClient()
  
  // Build the base query
  let query = supabase
    .from('posts')
    .select(`
      id,
      author_id,
      content,
      created_at,
      likes_count,
      reply_count,
      repost_count,
      view_count,
      profiles:author_id (
        display_name,
        username,
        avatar_url
      )
    `)
    .is('parent_id', null)

  // Filter by following if feedType is 'following' and user is logged in
  if (feedType === 'following' && userId) {
    // Get the list of users the current user follows
    const { data: followingData } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
    
    const followingIds = followingData?.map(f => f.following_id) || []
    
    // If not following anyone, return empty array
    if (followingIds.length === 0) {
      return []
    }
    
    // Filter posts to only show posts from followed users
    query = query.in('author_id', followingIds)
  }

  const { data: posts, error } = await query
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Error fetching posts:', error)
    return []
  }

  // If user is logged in, check which posts they liked
  let likedPostIds = new Set<string>()
  if (userId) {
    const postIds = posts?.map(p => p.id) || []
    if (postIds.length > 0) {
      const { data: likes } = await supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds)
      
      likedPostIds = new Set(likes?.map(l => l.post_id) || [])
    }
  }

  // Transform data to match PostData interface
  return ((posts as unknown) as PostWithProfile[] || []).map((post) => ({
    id: post.id,
    author_id: post.author_id,
    author: {
      name: post.profiles?.display_name || 'Unknown',
      handle: post.profiles?.username || 'unknown',
      avatar: post.profiles?.avatar_url,
    },
    content: post.content,
    timestamp: post.created_at,
    likes: post.likes_count || 0,
    likes_count: post.likes_count || 0,
    reposts: post.repost_count || 0,
    replies: post.reply_count || 0,
    views: post.view_count || 0,
    is_liked: likedPostIds.has(post.id),
  }))
}

export async function Feed() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  // Fetch both feeds
  const forYouPosts = await getPosts(user?.id, 'all')
  const followingPosts = await getPosts(user?.id, 'following')
  
  // Get user profile for CreatePost
  let userProfile = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    userProfile = profile
  }

  return (
    <FeedContent 
      forYouPosts={forYouPosts}
      followingPosts={followingPosts}
      user={user}
      userProfile={userProfile}
    />
  )
}
