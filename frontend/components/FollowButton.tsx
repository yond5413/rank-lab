'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface FollowButtonProps {
  targetUserId: string
  initialIsFollowing: boolean
  currentUserId?: string | null
}

export function FollowButton({ targetUserId, initialIsFollowing, currentUserId }: FollowButtonProps) {
  const router = useRouter()
  const supabase = createClient()
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)
  const [isLoading, setIsLoading] = useState(false)

  const handleFollowToggle = async () => {
    if (!currentUserId) {
      router.push('/login')
      return
    }

    if (isLoading) return

    // Optimistic update
    const newIsFollowing = !isFollowing
    setIsFollowing(newIsFollowing)
    setIsLoading(true)

    try {
      if (newIsFollowing) {
        // Follow
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: currentUserId,
            following_id: targetUserId,
          })
        
        if (error) throw error
      } else {
        // Unfollow
        const { error } = await supabase
          .from('follows')
          .delete()
          .match({
            follower_id: currentUserId,
            following_id: targetUserId,
          })
        
        if (error) throw error
      }
    } catch (error) {
      // Revert optimistic update on error
      setIsFollowing(!newIsFollowing)
      console.error('Error toggling follow:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button
      variant={isFollowing ? 'outline' : 'default'}
      className={`rounded-full ${isFollowing ? 'hover:bg-red-500/10 hover:text-red-500 hover:border-red-500' : ''}`}
      onClick={handleFollowToggle}
      disabled={isLoading}
    >
      {isFollowing ? 'Following' : 'Follow'}
    </Button>
  )
}
