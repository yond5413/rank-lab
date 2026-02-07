'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { MessageCircle, Repeat2, Heart, Share, Bookmark, MoreHorizontal, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { logEngagement } from '@/lib/api'
import type { PostData } from '@/types/post'
import { useRouter } from 'next/navigation'
import { DeletePostDialog } from './DeletePostDialog'

interface PostProps {
  post: PostData
  currentUserId?: string | null
  index?: number
}

export function Post({ post, currentUserId, index = 0 }: PostProps) {
  const router = useRouter()
  const supabase = createClient()
  const [isLiked, setIsLiked] = useState(post.is_liked || false)
  const [isBookmarked, setIsBookmarked] = useState(post.is_bookmarked || false)
  const [likesCount, setLikesCount] = useState(post.likes_count || 0)
  const [isLoading, setIsLoading] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeleted, setIsDeleted] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [showLikeAnimation, setShowLikeAnimation] = useState(false)

  // Log a "view" engagement when the post mounts
  useEffect(() => {
    if (currentUserId) {
      logEngagement({
        user_id: currentUserId,
        post_id: post.id,
        event_type: 'view',
      }).catch(() => {})
    }
  }, [])

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return `${diffInSeconds}s`
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (!currentUserId) {
      router.push('/login')
      return
    }

    if (isLoading) return

    const newIsLiked = !isLiked
    const newLikesCount = newIsLiked ? likesCount + 1 : likesCount - 1
    
    setIsLiked(newIsLiked)
    setLikesCount(newLikesCount)
    
    if (newIsLiked) {
      setShowLikeAnimation(true)
      setTimeout(() => setShowLikeAnimation(false), 600)
    }
    
    setIsLoading(true)

    try {
      if (newIsLiked) {
        const { error } = await supabase
          .from('likes')
          .insert({
            post_id: post.id,
            user_id: currentUserId,
          })
        
        if (error) throw error

        logEngagement({
          user_id: currentUserId,
          post_id: post.id,
          event_type: 'like',
        }).catch(() => {})
      } else {
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

    const newIsBookmarked = !isBookmarked
    setIsBookmarked(newIsBookmarked)
    setIsLoading(true)

    try {
      if (newIsBookmarked) {
        const { error } = await supabase
          .from('bookmarks')
          .insert({
            post_id: post.id,
            user_id: currentUserId,
          })
        
        if (error) throw error
      } else {
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
      setIsBookmarked(!newIsBookmarked)
      console.error('Error toggling bookmark:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!currentUserId || currentUserId !== post.author_id) return
    
    setIsDeleting(true)
    
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id)
        .eq('author_id', currentUserId)
      
      if (error) throw error

      setIsDeleted(true)
      setShowDeleteDialog(false)
      router.refresh()
    } catch (error) {
      console.error('Error deleting post:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleButtonClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handlePostClick = () => {
    router.push(`/post/${post.id}`)
  }

  if (isDeleted) return null

  return (
    <>
      <article 
        className="group relative"
        style={{ animationDelay: `${index * 50}ms` }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Subtle gradient background on hover */}
        <div 
          className={`absolute inset-0 bg-gradient-to-r from-emerald-500/[0.02] via-cyan-500/[0.02] to-violet-500/[0.02] 
            transition-opacity duration-300 pointer-events-none
            ${isHovered ? 'opacity-100' : 'opacity-0'}`}
        />
        
        {/* Hover glow effect */}
        <div 
          className={`absolute inset-0 transition-all duration-300 pointer-events-none
            ${isHovered ? 'shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]' : ''}`}
        />

        <div 
          className="relative flex gap-4 px-5 py-4 cursor-pointer transition-all duration-200 ease-out
            border-b border-border/50 hover:bg-accent/30"
          onClick={handlePostClick}
        >
          {/* Avatar with hover scale */}
          <Link 
            href={`/profile/${post.author.handle}`} 
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0"
          >
            <div className="relative group/avatar">
              <Avatar className="h-11 w-11 transition-transform duration-200 group-hover/avatar:scale-105">
                <AvatarImage 
                  src={post.author.avatar || undefined} 
                  alt={post.author.name}
                  className="object-cover"
                />
                <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-cyan-500 text-white text-sm font-semibold">
                  {post.author.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {/* Online indicator (optional) */}
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-background" />
            </div>
          </Link>
          
          <div className="flex-1 min-w-0 space-y-1">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[15px]">
                <Link 
                  href={`/profile/${post.author.handle}`} 
                  onClick={(e) => e.stopPropagation()}
                  className="font-bold text-foreground hover:underline decoration-2 underline-offset-2 truncate max-w-[150px]"
                >
                  {post.author.name}
                </Link>
                <span className="text-muted-foreground truncate">@{post.author.handle}</span>
                <span className="text-muted-foreground text-sm">·</span>
                <span className="text-muted-foreground text-sm hover:underline">
                  {post.timestamp ? formatTimestamp(post.timestamp) : ''}
                </span>
              </div>
              
              {/* Post actions dropdown */}
              {currentUserId === post.author_id && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/80 transition-all duration-200"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent 
                    align="end" 
                    onClick={(e) => e.stopPropagation()}
                    className="w-40"
                  >
                    <DropdownMenuItem 
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowDeleteDialog(true)
                      }}
                      className="text-destructive focus:text-destructive focus:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete post
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            
            {/* Content */}
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words text-foreground">
              {post.content}
            </p>
            
            {/* Action buttons */}
            <div className="flex items-center justify-between mt-3 pt-1 max-w-md">
              {/* Reply */}
              <button 
                onClick={handleButtonClick}
                className="group/btn flex items-center gap-2 text-muted-foreground hover:text-cyan-500 transition-all duration-200"
              >
                <div className="relative p-2 -m-2 rounded-full group-hover/btn:bg-cyan-500/10 transition-all duration-200">
                  <MessageCircle className="h-[18px] w-[18px] transition-transform duration-200 group-hover/btn:scale-110" />
                </div>
                {post.replies > 0 && (
                  <span className="text-[13px] tabular-nums">{post.replies}</span>
                )}
              </button>
              
              {/* Repost */}
              <button 
                onClick={handleButtonClick}
                className="group/btn flex items-center gap-2 text-muted-foreground hover:text-green-500 transition-all duration-200"
              >
                <div className="relative p-2 -m-2 rounded-full group-hover/btn:bg-green-500/10 transition-all duration-200">
                  <Repeat2 className="h-[18px] w-[18px] transition-transform duration-200 group-hover/btn:scale-110" />
                </div>
                {post.reposts > 0 && (
                  <span className="text-[13px] tabular-nums">{post.reposts}</span>
                )}
              </button>
              
              {/* Like with animation */}
              <button 
                onClick={handleLike}
                disabled={isLoading}
                className={`group/btn flex items-center gap-2 transition-all duration-200 ${
                  isLiked 
                    ? 'text-pink-500' 
                    : 'text-muted-foreground hover:text-pink-500'
                }`}
              >
                <div className={`relative p-2 -m-2 rounded-full transition-all duration-200 ${
                  isLiked ? 'bg-pink-500/10' : 'group-hover/btn:bg-pink-500/10'
                }`}>
                  <Heart 
                    className={`h-[18px] w-[18px] transition-all duration-200 ${
                      isLiked ? 'fill-current scale-110' : 'group-hover/btn:scale-110'
                    } ${showLikeAnimation ? 'animate-heart-burst' : ''}`} 
                  />
                  {/* Like burst particles */}
                  {showLikeAnimation && (
                    <>
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="absolute w-full h-full rounded-full bg-pink-500/30 animate-ping" />
                      </span>
                    </>
                  )}
                </div>
                {likesCount > 0 && (
                  <span className={`text-[13px] tabular-nums transition-colors duration-200 ${
                    isLiked ? 'text-pink-500' : ''
                  }`}>
                    {likesCount}
                  </span>
                )}
              </button>

              {/* Bookmark */}
              <button 
                onClick={handleBookmark}
                disabled={isLoading}
                className={`group/btn flex items-center gap-2 transition-all duration-200 ${
                  isBookmarked 
                    ? 'text-yellow-500' 
                    : 'text-muted-foreground hover:text-yellow-500'
                }`}
              >
                <div className={`relative p-2 -m-2 rounded-full transition-all duration-200 ${
                  isBookmarked ? 'bg-yellow-500/10' : 'group-hover/btn:bg-yellow-500/10'
                }`}>
                  <Bookmark 
                    className={`h-[18px] w-[18px] transition-all duration-200 ${
                      isBookmarked ? 'fill-current scale-110' : 'group-hover/btn:scale-110'
                    }`} 
                  />
                </div>
              </button>
              
              {/* Share */}
              <button 
                onClick={handleButtonClick}
                className="group/btn flex items-center text-muted-foreground hover:text-emerald-500 transition-all duration-200"
              >
                <div className="relative p-2 -m-2 rounded-full group-hover/btn:bg-emerald-500/10 transition-all duration-200">
                  <Share className="h-[18px] w-[18px] transition-transform duration-200 group-hover/btn:scale-110" />
                </div>
              </button>
            </div>
          </div>
        </div>
      </article>
      
      <DeletePostDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        postId={post.id}
        hasReplies={post.replies > 0}
        replyCount={post.replies}
        isDeleting={isDeleting}
      />
    </>
  )
}
