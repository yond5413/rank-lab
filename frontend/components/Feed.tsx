"use client"

import { useState, useEffect, useCallback } from 'react'
import { Post } from './Post'
import { CreatePost } from './CreatePost'
import { Sparkles, Users } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import type { PostData } from '@/types/post'

const getSupabaseClient = () => {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

interface PostWithProfile {
  id: string
  author_id: string
  content: string
  created_at: string | null
  likes_count: number | null
  reply_count: number | null
  repost_count: number | null
  view_count: number | null
  parent_id: string | null
  profiles: {
    display_name: string | null
    username: string | null
    avatar_url: string | null
  }[] | null
}

// Skeleton component for loading state
function PostSkeleton({ index }: { index: number }) {
  return (
    <div 
      className="flex gap-4 px-5 py-4 border-b border-border/50"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Avatar skeleton */}
      <div className="flex-shrink-0">
        <div className="h-11 w-11 rounded-full bg-muted animate-pulse" />
      </div>
      
      <div className="flex-1 min-w-0 space-y-3">
        {/* Header skeleton */}
        <div className="flex items-center gap-2">
          <div className="h-4 w-24 bg-muted rounded animate-pulse" />
          <div className="h-4 w-20 bg-muted rounded animate-pulse" />
          <div className="h-4 w-12 bg-muted rounded animate-pulse" />
        </div>
        
        {/* Content skeleton */}
        <div className="space-y-2">
          <div className="h-4 w-full bg-muted rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
        </div>
        
        {/* Actions skeleton */}
        <div className="flex items-center gap-8 pt-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 w-8 rounded-full bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}

// Empty state component
function EmptyState({ type }: { type: 'for-you' | 'following' }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500/20 via-cyan-500/20 to-violet-500/20 flex items-center justify-center mb-4">
        {type === 'following' ? (
          <Users className="h-8 w-8 text-emerald-500" />
        ) : (
          <Sparkles className="h-8 w-8 text-violet-500" />
        )}
      </div>
      
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {type === 'following' ? "You're not following anyone yet" : 'No posts yet'}
      </h3>
      
      <p className="text-muted-foreground text-sm max-w-xs mb-6">
        {type === 'following' 
          ? 'Follow people to see their posts here and build your personalized feed!' 
          : 'Be the first to share something amazing with the community.'}
      </p>
      
      {type === 'following' && (
        <button className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-full transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/25">
          Discover people to follow
        </button>
      )}
    </div>
  )
}

async function getRankedPostIds(userId: string): Promise<string[] | null> {
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ||
    'http://localhost:8000'

  try {
    const res = await fetch(`${apiBase}/api/v1/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, limit: 50 }),
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) return null

    const data = await res.json()
    if (data.posts && data.posts.length > 0) {
      return data.posts.map((p: { id: string }) => p.id)
    }
    return null
  } catch {
    return null
  }
}

async function getForYouPosts(userId: string | undefined): Promise<PostData[]> {
  const supabase = getSupabaseClient()

  let rankedIds: string[] | null = null
  if (userId) {
    rankedIds = await getRankedPostIds(userId)
  }

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
      parent_id,
      profiles:author_id (
        display_name,
        username,
        avatar_url
      )
    `)
    .is('parent_id', null)

  if (rankedIds && rankedIds.length > 0) {
    query = query.in('id', rankedIds)
  } else {
    query = query.order('created_at', { ascending: false }).limit(50)
  }

  const { data: posts, error } = await query

  if (error) {
    console.error('Error fetching for you posts:', error)
    return []
  }

  let likedPostIds = new Set<string>()
  let bookmarkedPostIds = new Set<string>()
  
  if (userId && posts && posts.length > 0) {
    const postIds = posts.map(p => p.id)
    
    const [likesResult, bookmarksResult] = await Promise.all([
      supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds),
      supabase
        .from('bookmarks')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds)
    ])
    
    likedPostIds = new Set(likesResult.data?.map(l => l.post_id) || [])
    bookmarkedPostIds = new Set(bookmarksResult.data?.map(b => b.post_id) || [])
  }

  const typedPosts = (posts as unknown) as PostWithProfile[]
  const postDataList = (typedPosts || [])
    .filter(post => !post.parent_id)
    .map((post) => {
      const profile = post.profiles?.[0]
      return {
        id: post.id,
        author_id: post.author_id,
        author: {
          name: profile?.display_name || 'Unknown',
          handle: profile?.username || 'unknown',
          avatar: profile?.avatar_url,
        },
        content: post.content,
        timestamp: post.created_at,
        likes: post.likes_count || 0,
        likes_count: post.likes_count || 0,
        reposts: post.repost_count || 0,
        replies: post.reply_count || 0,
        views: post.view_count || 0,
        is_liked: likedPostIds.has(post.id),
        is_bookmarked: bookmarkedPostIds.has(post.id),
        bookmarks_count: 0,
      }
    })

  if (rankedIds && rankedIds.length > 0) {
    const postMap = new Map(postDataList.map(p => [p.id, p]))
    return rankedIds
      .map(id => postMap.get(id))
      .filter((p): p is typeof postDataList[number] => p !== undefined)
  }

  return postDataList
}

async function getFollowingPosts(userId: string): Promise<PostData[]> {
  const supabase = getSupabaseClient()

  const { data: follows, error: followsError } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId)

  if (followsError) {
    console.error('Error fetching follows:', followsError)
    return []
  }

  if (!follows || follows.length === 0) {
    return []
  }

  const followingIds = follows.map(f => f.following_id)

  const { data: posts, error } = await supabase
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
      parent_id,
      profiles:author_id (
        display_name,
        username,
        avatar_url
      )
    `)
    .in('author_id', followingIds)
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Error fetching following posts:', error)
    return []
  }

  let likedPostIds = new Set<string>()
  let bookmarkedPostIds = new Set<string>()
  
  if (posts && posts.length > 0) {
    const postIds = posts.map(p => p.id)
    
    const [likesResult, bookmarksResult] = await Promise.all([
      supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds),
      supabase
        .from('bookmarks')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds)
    ])
    
    likedPostIds = new Set(likesResult.data?.map(l => l.post_id) || [])
    bookmarkedPostIds = new Set(bookmarksResult.data?.map(b => b.post_id) || [])
  }

  const typedPosts = (posts as unknown) as PostWithProfile[]
  return (typedPosts || [])
    .filter(post => !post.parent_id)
    .map((post) => {
      const profile = post.profiles?.[0]
      return {
        id: post.id,
        author_id: post.author_id,
        author: {
          name: profile?.display_name || 'Unknown',
          handle: profile?.username || 'unknown',
          avatar: profile?.avatar_url,
        },
        content: post.content,
        timestamp: post.created_at,
        likes: post.likes_count || 0,
        likes_count: post.likes_count || 0,
        reposts: post.repost_count || 0,
        replies: post.reply_count || 0,
        views: post.view_count || 0,
        is_liked: likedPostIds.has(post.id),
        is_bookmarked: bookmarkedPostIds.has(post.id),
        bookmarks_count: 0,
      }
    })
}

interface UserProfile {
  id: string
  display_name?: string
  username?: string
  avatar_url?: string
}

export function Feed() {
  const [activeTab, setActiveTab] = useState<'for-you' | 'following'>('for-you')
  const [posts, setPosts] = useState<PostData[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    
    if (activeTab === 'for-you') {
      const data = await getForYouPosts(user?.id)
      setPosts(data)
    } else if (activeTab === 'following' && user?.id) {
      const data = await getFollowingPosts(user.id)
      setPosts(data)
    }
    
    setLoading(false)
  }, [activeTab, user?.id])

  useEffect(() => {
    const init = async () => {
      const supabase = getSupabaseClient()
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      setUser(currentUser)

      if (currentUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUser.id)
          .single()
        
        if (profile) {
          setUserProfile({
            id: currentUser.id,
            display_name: profile.display_name,
            username: profile.username,
            avatar_url: profile.avatar_url ?? undefined,
          })
        }
      }
    }
    
    init()
  }, [])

  useEffect(() => {
    if (user !== null) {
      fetchPosts()
    }
  }, [fetchPosts, user])

  return (
    <main className="flex-1 border-x border-border min-h-screen max-w-[600px] mx-auto">
      {/* Sticky Header with Modern Tabs */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl border-b border-border/50">
        {/* Title */}
        <div className="px-5 py-3">
          <h2 className="text-xl font-bold tracking-tight">Home</h2>
        </div>
        
        {/* Modern Pill-style Tabs */}
        <div className="px-4 pb-3">
          <div className="relative flex p-1 bg-muted/50 rounded-xl">
            {/* Animated background pill */}
            <div 
              className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-background rounded-lg shadow-sm border border-border/50 transition-all duration-300 ease-out ${
                activeTab === 'for-you' ? 'left-1' : 'left-[calc(50%+3px)]'
              }`}
            />
            
            {/* Tab buttons */}
            <button
              onClick={() => setActiveTab('for-you')}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                activeTab === 'for-you' 
                  ? 'text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles className={`h-4 w-4 transition-all duration-300 ${
                activeTab === 'for-you' ? 'scale-110 text-violet-500' : ''
              }`} />
              For You
            </button>
            
            <button
              onClick={() => setActiveTab('following')}
              className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-colors duration-200 ${
                activeTab === 'following' 
                  ? 'text-foreground' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className={`h-4 w-4 transition-all duration-300 ${
                activeTab === 'following' ? 'scale-110 text-emerald-500' : ''
              }`} />
              Following
            </button>
          </div>
        </div>
      </header>

      {/* Create Post */}
      <CreatePost user={userProfile} />

      {/* Content */}
      <div className="relative">
        {loading ? (
          // Skeleton loading state
          <div className="animate-fade-in">
            {[...Array(5)].map((_, i) => (
              <PostSkeleton key={i} index={i} />
            ))}
          </div>
        ) : posts.length === 0 ? (
          // Empty state
          <EmptyState type={activeTab} />
        ) : (
          // Posts list with staggered animation
          <div className="animate-fade-in">
            {posts.map((post, index) => (
              <Post 
                key={post.id} 
                post={post} 
                currentUserId={user?.id}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Loading more indicator */}
      {!loading && posts.length > 0 && (
        <div className="py-6 text-center">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Loading more posts...
          </div>
        </div>
      )}
    </main>
  )
}
