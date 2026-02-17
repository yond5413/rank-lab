import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Post } from '@/components/Post'
import { ThreadedPost } from '@/components/ThreadedPost'
import { LeftSidebar } from '@/components/LeftSidebar'
import { RightSidebar } from '@/components/RightSidebar'
import { createClient } from '@/lib/supabase/server'
import type { PostData } from '@/types/post'
import type { Tables } from '@/types/database'
import { ReplyForm } from './ReplyForm'

interface PostDetailPageProps {
  params: Promise<{ id: string }>
}

interface PostWithProfile extends Tables<'posts'> {
  profiles: {
    display_name: string
    username: string
    avatar_url: string | null
  } | null
  //parent_id?: string | null
}

async function getPost(postId: string, currentUserId?: string): Promise<PostData | null> {
  const supabase = await createClient()
  
  const { data: post, error } = await supabase
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
    .eq('id', postId)
    .single()

  if (error || !post) {
    return null
  }

  // Check if current user has liked this post
  let isLiked = false
  if (currentUserId) {
    const { data: like } = await supabase
      .from('likes')
      .select('id')
      .eq('user_id', currentUserId)
      .eq('post_id', postId)
      .single()
    
    isLiked = !!like
  }

  const postWithProfile = post as unknown as PostWithProfile

  return {
    id: postWithProfile.id,
    author_id: postWithProfile.author_id,
    author: {
      name: postWithProfile.profiles?.display_name || 'Unknown',
      handle: postWithProfile.profiles?.username || 'unknown',
      avatar: postWithProfile.profiles?.avatar_url,
    },
    content: postWithProfile.content,
    timestamp: postWithProfile.created_at,
    likes: postWithProfile.likes_count || 0,
    likes_count: postWithProfile.likes_count || 0,
    reposts: postWithProfile.repost_count || 0,
    replies: postWithProfile.reply_count || 0,
    views: postWithProfile.view_count || 0,
    is_liked: isLiked,
  }
}

interface ThreadedPostData extends PostData {
  thread_depth: number
  root_post_id?: string | null
  parent_id?: string | null
  children?: ThreadedPostData[]
}

async function getThreadReplies(postId: string, currentUserId?: string): Promise<ThreadedPostData[]> {
  const supabase = await createClient()
  
  // Get all replies in the thread (not just direct replies)
  const { data: replies, error } = await supabase
    .from('posts')
    .select(`
      id,
      author_id,
      parent_id,
      content,
      created_at,
      likes_count,
      reply_count,
      repost_count,
      view_count,
      thread_depth,
      root_post_id,
      profiles:author_id (
        display_name,
        username,
        avatar_url
      )
    `)
    .or(`parent_id.eq.${postId},root_post_id.eq.${postId}`)
    .order('created_at', { ascending: true })
    .limit(200) // Increased limit for threaded view

  if (error || !replies) {
    return []
  }

  let likedPostIds = new Set<string>()
  let bookmarkedPostIds = new Set<string>()
  
  if (currentUserId && replies.length > 0) {
    const postIds = replies.map(p => p.id)
    
    // Get likes
    const { data: likes } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_id', currentUserId)
      .in('post_id', postIds)
    
    likedPostIds = new Set(likes?.map(l => l.post_id) || [])
    
    // Get bookmarks
    const { data: bookmarks } = await supabase
      .from('bookmarks')
      .select('post_id')
      .eq('user_id', currentUserId)
      .in('post_id', postIds)
    
    bookmarkedPostIds = new Set(bookmarks?.map(b => b.post_id) || [])
  }

  // Transform replies to ThreadedPostData
  const threadedPosts: ThreadedPostData[] = ((replies as unknown) as (PostWithProfile & {
    parent_id: string | null
    thread_depth: number
    root_post_id: string | null
  })[] || []).map((post) => ({
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
    is_bookmarked: bookmarkedPostIds.has(post.id),
    thread_depth: post.thread_depth || 0,
    root_post_id: post.root_post_id,
    parent_id: post.parent_id,
    children: []
  }))

  // Build the threaded structure
  const postMap = new Map<string, ThreadedPostData>()
  const rootReplies: ThreadedPostData[] = []

  // First pass: create map of all posts
  threadedPosts.forEach(post => {
    postMap.set(post.id, post)
  })

  // Second pass: build parent-child relationships
  threadedPosts.forEach(post => {
    if (post.parent_id === postId) {
      // Direct reply to the main post
      rootReplies.push(post)
    } else if (post.parent_id && postMap.has(post.parent_id)) {
      // Reply to another reply
      const parent = postMap.get(post.parent_id)!
      parent.children!.push(post)
    }
  })

  return rootReplies
}

export default async function PostDetailPage({ params }: PostDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const post = await getPost(id, user?.id)

  if (!post) {
    notFound()
  }

  const replies = await getThreadReplies(id, user?.id)

  // Get user profile for reply form
  let userProfile = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    userProfile = profile
  }

  const formatFullTimestamp = (timestamp: string | null) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <LeftSidebar />
        
        <main className="flex-1 border-x border-border min-h-screen max-w-[600px] mx-auto">
          {/* Header */}
          <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3">
            <div className="flex items-center gap-6">
              <Link href="/">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <h2 className="text-xl font-bold">Post</h2>
            </div>
          </header>

          {/* Main Post - Full Detail View */}
          <article className="p-4 border-b border-border">
            <div className="flex gap-3">
              <Link href={`/profile/${post.author.handle}`}>
                <Avatar className="h-12 w-12 flex-shrink-0">
                  <AvatarImage src={post.author.avatar || undefined} alt={post.author.name} />
                  <AvatarFallback>{post.author.name.charAt(0)}</AvatarFallback>
                </Avatar>
              </Link>
              
              <div>
                <Link href={`/profile/${post.author.handle}`} className="hover:underline">
                  <span className="font-bold text-foreground">{post.author.name}</span>
                </Link>
                <p className="text-muted-foreground">@{post.author.handle}</p>
              </div>
            </div>

            <p className="text-xl leading-relaxed mt-4 whitespace-pre-wrap break-words">
              {post.content}
            </p>

            <p className="text-muted-foreground text-sm mt-4 pt-4 border-t border-border">
              {formatFullTimestamp(post.timestamp)}
            </p>

            {/* Stats */}
            <div className="flex gap-6 mt-4 pt-4 border-t border-border text-sm">
              <div>
                <span className="font-bold">{post.reposts}</span>
                <span className="text-muted-foreground ml-1">Reposts</span>
              </div>
              <div>
                <span className="font-bold">{post.likes}</span>
                <span className="text-muted-foreground ml-1">Likes</span>
              </div>
              <div>
                <span className="font-bold">{post.views || 0}</span>
                <span className="text-muted-foreground ml-1">Views</span>
              </div>
            </div>
          </article>

          {/* Reply Form */}
          <ReplyForm 
            postId={post.id}
            user={userProfile ? {
              id: user!.id,
              display_name: userProfile.display_name,
              username: userProfile.username,
              avatar_url: userProfile.avatar_url,
            } : null}
          />

          {/* Replies */}
          <div>
            {replies.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p className="text-lg font-medium mb-2">No replies yet</p>
                <p className="text-sm">Be the first to reply!</p>
              </div>
            ) : (
              <div className="space-y-0">
                {replies.map((reply, index) => (
                  <ThreadedPost 
                    key={reply.id} 
                    post={reply} 
                    currentUserId={user?.id}
                    isLastInLevel={index === replies.length - 1}
                    showConnectingLines={true}
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        <RightSidebar />
      </div>
    </div>
  )
}

