'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { MessageCircle, Repeat2, Heart, Share, ChevronDown, ChevronUp, Bookmark } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { logEngagement } from '@/lib/api'
import type { PostData } from '@/types/post'
import { useRouter } from 'next/navigation'

interface ThreadedPostData extends PostData {
  thread_depth: number
  root_post_id?: string | null
  is_bookmarked?: boolean
  children?: ThreadedPostData[]
}

interface ThreadedPostProps {
  post: ThreadedPostData
  currentUserId?: string | null
  isLastInLevel?: boolean
  showConnectingLines?: boolean
  parentConnectingLines?: boolean[]
  onReplyCountChange?: (postId: string, delta: number) => void
}

export function ThreadedPost({ 
  post, 
  currentUserId, 
  isLastInLevel = false,
  showConnectingLines = true,
  parentConnectingLines = [],
  onReplyCountChange
}: ThreadedPostProps) {
  const router = useRouter()
  const supabase = createClient()
  const [isLiked, setIsLiked] = useState(post.is_liked || false)
  const [isBookmarked, setIsBookmarked] = useState(post.is_bookmarked || false)
  const [likesCount, setLikesCount] = useState(post.likes_count || 0)
  const [repliesCount, setRepliesCount] = useState(post.replies || 0)
  const [isLoading, setIsLoading] = useState(false)
  const [showReplies, setShowReplies] = useState(true)
  const [collapsedReplies, setCollapsedReplies] = useState(post.thread_depth > 2)

  const maxVisibleDepth = 6
  const isDeepThread = post.thread_depth >= maxVisibleDepth

  // Log a "view" engagement when the post mounts (fire-and-forget)
  useEffect(() => {
    if (currentUserId) {
      logEngagement({
        user_id: currentUserId,
        post_id: post.id,
        event_type: 'view',
      }).catch(() => {
        // Silently ignore – view tracking is best-effort
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return `${diffInSeconds}s`
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`
    return `${Math.floor(diffInSeconds / 86400)}d`
  }

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!currentUserId) {
      router.push('/login')
      return
    }

    if (isLoading) return

    // Optimistic update
    const newIsLiked = !isLiked
    const newLikesCount = newIsLiked ? likesCount + 1 : likesCount - 1
    setIsLiked(newIsLiked)
    setLikesCount(newLikesCount)
    setIsLoading(true)

    try {
      if (newIsLiked) {
        // Add like in Supabase
        const { error } = await supabase
          .from('likes')
          .insert({
            post_id: post.id,
            user_id: currentUserId,
          })
        
        if (error) throw error

        // Send engagement event to backend (fire-and-forget)
        logEngagement({
          user_id: currentUserId,
          post_id: post.id,
          event_type: 'like',
        }).catch(() => {})
      } else {
        // Remove like
        const { error } = await supabase
          .from('likes')
          .delete()
          .match({
            post_id: post.id,
            user_id: currentUserId,
          })
        
        if (error) throw error
      }
    } catch (error) {
      // Revert optimistic update on error
      setIsLiked(!newIsLiked)
      setLikesCount(newIsLiked ? likesCount : likesCount)
      console.error('Error toggling like:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleBookmark = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!currentUserId) {
      router.push('/login')
      return
    }

    if (isLoading) return

    // Optimistic update
    const newIsBookmarked = !isBookmarked
    setIsBookmarked(newIsBookmarked)
    setIsLoading(true)

    try {
      if (newIsBookmarked) {
        // Add bookmark in Supabase
        const { error } = await supabase
          .from('bookmarks')
          .insert({
            post_id: post.id,
            user_id: currentUserId,
          })
        
        if (error) throw error

        // Send engagement event to backend (fire-and-forget)
        logEngagement({
          user_id: currentUserId,
          post_id: post.id,
          event_type: 'bookmark',
        }).catch(() => {})
      } else {
        // Remove bookmark
        const { error } = await supabase
          .from('bookmarks')
          .delete()
          .match({
            post_id: post.id,
            user_id: currentUserId,
          })
        
        if (error) throw error
      }
    } catch (error) {
      // Revert optimistic update on error
      setIsBookmarked(!newIsBookmarked)
      console.error('Error toggling bookmark:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleButtonClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handlePostClick = () => {
    router.push(`/post/${post.id}`)
  }

  const toggleReplies = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowReplies(!showReplies)
  }

  const toggleCollapsed = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCollapsedReplies(!collapsedReplies)
  }

  // Generate connecting lines for thread visualization
  const connectingLines = showConnectingLines ? [...parentConnectingLines] : []
  if (showConnectingLines && post.thread_depth > 0) {
    connectingLines[post.thread_depth - 1] = !isLastInLevel
  }

  const threadIndent = Math.min(post.thread_depth * 24, maxVisibleDepth * 24)

  return (
    <div className="relative">
      {/* Thread connecting lines */}
      {showConnectingLines && post.thread_depth > 0 && (
        <div className="absolute left-0 top-0 bottom-0 pointer-events-none">
          {connectingLines.slice(0, post.thread_depth).map((shouldShow, depth) => (
            <div
              key={depth}
              className={`absolute w-px bg-border ${shouldShow ? 'h-full' : 'h-12'}`}
              style={{ left: `${depth * 24 + 20}px` }}
            />
          ))}
          {/* Horizontal line to post */}
          <div
            className="absolute w-6 h-px bg-border top-6"
            style={{ left: `${(post.thread_depth - 1) * 24 + 20}px` }}
          />
        </div>
      )}

      <article 
        className={`flex gap-3 px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors cursor-pointer relative ${
          isDeepThread ? 'bg-muted/20' : ''
        }`}
        style={{ marginLeft: `${threadIndent}px` }}
        onClick={handlePostClick}
      >
        <Link href={`/profile/${post.author.handle}`} onClick={(e) => e.stopPropagation()}>
          <Avatar className={`flex-shrink-0 ${post.thread_depth > 0 ? 'h-8 w-8' : 'h-10 w-10'}`}>
            <AvatarImage src={post.author.avatar || undefined} alt={post.author.name} />
            <AvatarFallback>{post.author.name.charAt(0)}</AvatarFallback>
          </Avatar>
        </Link>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-sm">
            <Link 
              href={`/profile/${post.author.handle}`} 
              onClick={(e) => e.stopPropagation()}
              className="font-bold text-foreground truncate hover:underline"
            >
              {post.author.name}
            </Link>
            <span className="text-muted-foreground truncate">@{post.author.handle}</span>
            <span className="text-muted-foreground">&middot;</span>
            <span className="text-muted-foreground">{post.timestamp ? formatTimestamp(post.timestamp) : ''}</span>
            {post.thread_depth > 0 && (
              <>
                <span className="text-muted-foreground">&middot;</span>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  Level {post.thread_depth + 1}
                </span>
              </>
            )}
          </div>
          
          <p className={`leading-relaxed mt-1 whitespace-pre-wrap break-words text-foreground ${
            post.thread_depth > 0 ? 'text-sm' : 'text-[15px]'
          }`}>
            {post.content}
          </p>
          
          <div className="flex justify-between mt-3 max-w-md">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleButtonClick}
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10"
            >
              <MessageCircle className="h-4 w-4" />
              {repliesCount > 0 && <span className="text-xs ml-1">{repliesCount}</span>}
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleButtonClick}
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-green-500 hover:bg-green-500/10"
            >
              <Repeat2 className="h-4 w-4" />
              {post.reposts > 0 && <span className="text-xs ml-1">{post.reposts}</span>}
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleLike}
              disabled={isLoading}
              className={`h-8 w-8 rounded-full transition-colors ${
                isLiked 
                  ? 'text-pink-500 hover:text-pink-600 hover:bg-pink-500/10' 
                  : 'text-muted-foreground hover:text-pink-500 hover:bg-pink-500/10'
              }`}
            >
              <Heart className={`h-4 w-4 ${isLiked ? 'fill-current' : ''}`} />
              {likesCount > 0 && <span className="text-xs ml-1">{likesCount}</span>}
            </Button>

            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleBookmark}
              disabled={isLoading}
              className={`h-8 w-8 rounded-full transition-colors ${
                isBookmarked 
                  ? 'text-yellow-600 hover:text-yellow-700 hover:bg-yellow-500/10' 
                  : 'text-muted-foreground hover:text-yellow-600 hover:bg-yellow-500/10'
              }`}
            >
              <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`} />
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleButtonClick}
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10"
            >
              <Share className="h-4 w-4" />
            </Button>
          </div>

          {/* Reply collapse toggle for threads with replies */}
          {post.children && post.children.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleCollapsed}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {collapsedReplies ? (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Show {post.children.length} {post.children.length === 1 ? 'reply' : 'replies'}
                </>
              ) : (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Hide replies
                </>
              )}
            </Button>
          )}
        </div>
      </article>

      {/* Render child replies */}
      {post.children && post.children.length > 0 && showReplies && !collapsedReplies && (
        <div className="relative">
          {post.children.map((child, index) => (
            <ThreadedPost
              key={child.id}
              post={child}
              currentUserId={currentUserId}
              isLastInLevel={index === post.children!.length - 1}
              showConnectingLines={showConnectingLines}
              parentConnectingLines={connectingLines}
              onReplyCountChange={onReplyCountChange}
            />
          ))}
          
          {/* "Show more" for deeply nested threads */}
          {isDeepThread && (
            <div className="ml-8 p-4 text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/post/${post.root_post_id || post.id}`)}
              >
                Continue this thread →
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}