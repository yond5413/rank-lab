import { Search } from 'lucide-react'
import { LeftSidebar } from '@/components/LeftSidebar'
import { RightSidebar } from '@/components/RightSidebar'
import { Post } from '@/components/Post'
import { createClient } from '@/lib/supabase/server'
import type { PostData } from '@/types/post'
import type { Tables } from '@/types/database'
import { SearchForm } from './SearchForm'

interface PostWithProfile extends Tables<'posts'> {
  profiles: {
    display_name: string
    username: string
    avatar_url: string | null
  } | null
}

interface TrendingHashtag {
  tag: string
  count: number
}

async function getTrendingHashtags(): Promise<TrendingHashtag[]> {
  const supabase = await createClient()
  
  const { data: posts } = await supabase
    .from('posts')
    .select('content')
    .order('created_at', { ascending: false })
    .limit(200)

  if (!posts) return []

  // Extract hashtags from posts
  const hashtagCounts = new Map<string, number>()
  
  posts.forEach(post => {
    const hashtags = post.content.match(/#\w+/g) || []
    hashtags.forEach(tag => {
      const normalizedTag = tag.toLowerCase()
      hashtagCounts.set(normalizedTag, (hashtagCounts.get(normalizedTag) || 0) + 1)
    })
  })

  // Sort by count and return top 5
  return Array.from(hashtagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }))
}

async function searchPosts(query: string, currentUserId?: string): Promise<PostData[]> {
  const supabase = await createClient()
  
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
      profiles:author_id (
        display_name,
        username,
        avatar_url
      )
    `)
    .is('parent_id', null)  // Only show top-level posts, not replies
    .ilike('content', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Error searching posts:', error)
    return []
  }

  // Check which posts the current user has liked
  let likedPostIds = new Set<string>()
  if (currentUserId) {
    const postIds = posts?.map(p => p.id) || []
    if (postIds.length > 0) {
      const { data: likes } = await supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', currentUserId)
        .in('post_id', postIds)
      
      likedPostIds = new Set(likes?.map(l => l.post_id) || [])
    }
  }

  return ((posts as unknown) as PostWithProfile[] || [])
    .filter(post => !post.parent_id)
    .map((post) => ({
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

async function getRecentPosts(currentUserId?: string): Promise<PostData[]> {
  const supabase = await createClient()
  
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
      profiles:author_id (
        display_name,
        username,
        avatar_url
      )
    `)
    .is('parent_id', null)  // Only show top-level posts, not replies
    .order('likes_count', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Error fetching recent posts:', error)
    return []
  }

  // Check which posts the current user has liked
  let likedPostIds = new Set<string>()
  if (currentUserId) {
    const postIds = posts?.map(p => p.id) || []
    if (postIds.length > 0) {
      const { data: likes } = await supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', currentUserId)
        .in('post_id', postIds)
      
      likedPostIds = new Set(likes?.map(l => l.post_id) || [])
    }
  }

  return ((posts as unknown) as PostWithProfile[] || [])
    .filter(post => !post.parent_id)
    .map((post) => ({
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

interface ExplorePageProps {
  searchParams: Promise<{ q?: string }>
}

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const { q: query } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const trendingHashtags = await getTrendingHashtags()
  const posts = query 
    ? await searchPosts(query, user?.id)
    : await getRecentPosts(user?.id)

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <LeftSidebar />
        
        <main className="flex-1 border-x border-border min-h-screen max-w-[600px] mx-auto">
          {/* Header with Search */}
          <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3">
            <SearchForm initialQuery={query} />
          </header>

          {/* Trending Hashtags */}
          {!query && trendingHashtags.length > 0 && (
            <div className="border-b border-border p-4">
              <h2 className="text-xl font-bold mb-4">Trending</h2>
              <div className="flex flex-wrap gap-2">
                {trendingHashtags.map(({ tag, count }) => (
                  <a
                    key={tag}
                    href={`/explore?q=${encodeURIComponent(tag)}`}
                    className="px-4 py-2 bg-accent rounded-full hover:bg-accent/80 transition-colors"
                  >
                    <span className="font-semibold">{tag}</span>
                    <span className="text-muted-foreground text-sm ml-2">{count} posts</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Search Results or Popular Posts */}
          <div>
            <div className="px-4 py-3 border-b border-border">
              <h2 className="font-bold text-lg">
                {query ? `Results for "${query}"` : 'Popular posts'}
              </h2>
            </div>

            {posts.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">
                  {query ? 'No results found' : 'No posts yet'}
                </p>
                <p className="text-sm">
                  {query 
                    ? `Try searching for something else`
                    : 'Be the first to post something!'}
                </p>
              </div>
            ) : (
              posts.map((post) => (
                <Post key={post.id} post={post} currentUserId={user?.id} />
              ))
            )}
          </div>
        </main>

        <RightSidebar />
      </div>
    </div>
  )
}


