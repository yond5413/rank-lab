import { Post } from './Post'
import { CreatePost } from './CreatePost'
import { createClient } from '@/lib/supabase/server'
import type { PostData } from '@/types/post'
import type { Tables } from '@/types/database'

interface PostWithProfile extends Tables<'posts'> {
  profiles: {
    display_name: string
    username: string
    avatar_url: string | null
  } | null
}

/**
 * Try to fetch a ranked feed from the backend recommendation API.
 * Returns null if the backend is unavailable so we can fall back
 * to a chronological Supabase query.
 */
async function getRankedPostIds(userId: string): Promise<string[] | null> {
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ||
    'http://localhost:8000'

  try {
    const res = await fetch(`${apiBase}/api/v1/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, limit: 50 }),
      // Short timeout so we don't block the page if backend is down
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) return null

    const data = await res.json()
    if (data.posts && data.posts.length > 0) {
      return data.posts.map((p: { id: string }) => p.id)
    }
    return null
  } catch {
    // Backend unavailable — fall back to chronological
    return null
  }
}

async function getPosts(userId?: string): Promise<PostData[]> {
  const supabase = await createClient()

  // ---------- Try ranked feed first ----------
  let rankedIds: string[] | null = null
  if (userId) {
    rankedIds = await getRankedPostIds(userId)
  }

  // ---------- Fetch posts ----------
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

  if (rankedIds && rankedIds.length > 0) {
    // Fetch the specific posts the backend recommended
    query = query.in('id', rankedIds)
  } else {
    // Fallback: chronological
    query = query.order('created_at', { ascending: false }).limit(50)
  }

  const { data: posts, error } = await query

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
  const postDataList = ((posts as unknown) as PostWithProfile[] || []).map((post) => ({
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

  // If we got ranked ids, preserve the ranking order
  if (rankedIds && rankedIds.length > 0) {
    const postMap = new Map(postDataList.map(p => [p.id, p]))
    return rankedIds
      .map(id => postMap.get(id))
      .filter((p): p is PostData => p !== undefined)
  }

  return postDataList
}

export async function Feed() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const posts = await getPosts(user?.id)
  
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
    <main className="flex-1 border-x border-border min-h-screen max-w-[600px] mx-auto">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3">
        <h2 className="text-xl font-bold">Home</h2>
      </header>

      <CreatePost 
        user={userProfile ? {
          id: user!.id,
          display_name: userProfile.display_name,
          username: userProfile.username,
          avatar_url: userProfile.avatar_url,
        } : null} 
      />

      {posts.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          <p className="text-lg font-medium mb-2">No posts yet</p>
          <p className="text-sm">Be the first to post something!</p>
        </div>
      ) : (
        <div>
          {posts.map((post) => (
            <Post key={post.id} post={post} currentUserId={user?.id} />
          ))}
        </div>
      )}
      
      <div className="p-4 text-center text-muted-foreground text-sm">
        {posts.length > 0 ? 'Loading more posts...' : ''}
      </div>
    </main>
  )
}
