'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MessageCircle, Repeat2, Heart, Share } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { PostData } from '@/types/post'
import { useRouter } from 'next/navigation'

interface PostProps {
  post: PostData
  currentUserId?: string | null
}

export function Post({ post, currentUserId }: PostProps) {
  const router = useRouter()
  const supabase = createClient()
  const [isLiked, setIsLiked] = useState(post.is_liked || false)
  const [likesCount, setLikesCount] = useState(post.likes_count || 0)
  const [isLoading, setIsLoading] = useState(false)

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
        // Add like
        const { error } = await supabase
          .from('likes')
          .insert({
            post_id: post.id,
            user_id: currentUserId,
          })
        
        if (error) throw error
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

  const handleButtonClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <Link href={`/post/${post.id}`}>
      <article className="flex gap-3 px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors cursor-pointer">
        <Link href={`/profile/${post.author.handle}`} onClick={(e) => e.stopPropagation()}>
          <Avatar className="h-10 w-10 flex-shrink-0">
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
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{post.timestamp ? formatTimestamp(post.timestamp) : ''}</span>
          </div>
          
          <p className="text-[15px] leading-relaxed mt-1 whitespace-pre-wrap break-words text-foreground">
            {post.content}
          </p>
          
          <div className="flex justify-between mt-3 max-w-md">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleButtonClick}
              className="h-9 w-9 rounded-full text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10"
            >
              <MessageCircle className="h-5 w-5" />
              {post.replies > 0 && <span className="text-xs ml-1">{post.replies}</span>}
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleButtonClick}
              className="h-9 w-9 rounded-full text-muted-foreground hover:text-green-500 hover:bg-green-500/10"
            >
              <Repeat2 className="h-5 w-5" />
              {post.reposts > 0 && <span className="text-xs ml-1">{post.reposts}</span>}
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleLike}
              disabled={isLoading}
              className={`h-9 w-9 rounded-full transition-colors ${
                isLiked 
                  ? 'text-pink-500 hover:text-pink-600 hover:bg-pink-500/10' 
                  : 'text-muted-foreground hover:text-pink-500 hover:bg-pink-500/10'
              }`}
            >
              <Heart className={`h-5 w-5 ${isLiked ? 'fill-current' : ''}`} />
              {likesCount > 0 && <span className="text-xs ml-1">{likesCount}</span>}
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleButtonClick}
              className="h-9 w-9 rounded-full text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10"
            >
              <Share className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </article>
    </Link>
  )
}
