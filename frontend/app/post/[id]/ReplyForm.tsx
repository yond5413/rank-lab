'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

interface ReplyFormProps {
  postId: string
  user?: {
    id: string
    display_name?: string
    username?: string
    avatar_url?: string | null
  } | null
}

export function ReplyForm({ postId, user }: ReplyFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user) {
      router.push('/login')
      return
    }

    if (!content.trim()) return

    setIsLoading(true)

    try {
      // Create a new post as a reply with parent_id
      const { error } = await supabase
        .from('posts')
        .insert({
          author_id: user.id,
          content: content.trim(),
          parent_id: postId,
        })

      if (error) throw error

      setContent('')
      router.refresh()
    } catch (error) {
      console.error('Error creating reply:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="px-4 py-3 border-b border-border">
        <p className="text-center text-muted-foreground">
          <Button variant="link" onClick={() => router.push('/login')}>
            Sign in to reply
          </Button>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 py-3 border-b border-border">
      <div className="flex gap-3">
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarImage src={user?.avatar_url || undefined} alt={user?.display_name || 'User'} />
          <AvatarFallback>{user?.display_name?.charAt(0) || 'U'}</AvatarFallback>
        </Avatar>
        
        <div className="flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Post your reply..."
            className="w-full bg-transparent border-none resize-none text-[17px] leading-6 placeholder:text-muted-foreground focus:outline-none min-h-[60px]"
            maxLength={280}
            rows={2}
          />
          
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
            <span className={`text-sm ${content.length > 260 ? 'text-orange-500' : 'text-muted-foreground'}`}>
              {content.length}/280
            </span>
            <Button 
              type="submit" 
              disabled={isLoading || !content.trim()}
              className="rounded-full px-6"
            >
              {isLoading ? 'Replying...' : 'Reply'}
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}

