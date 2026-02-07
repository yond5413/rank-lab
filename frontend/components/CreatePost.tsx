'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Image, Smile, MapPin, BarChart3, Calendar, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { embedPost } from '@/lib/api'

interface CreatePostProps {
  user?: {
    id: string
    display_name?: string
    username?: string
    avatar_url?: string
  } | null
}

export function CreatePost({ user }: CreatePostProps) {
  const router = useRouter()
  const supabase = createClient()
  const [content, setContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [charCount, setCharCount] = useState(0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user) {
      router.push('/login')
      return
    }

    if (!content.trim()) return

    setIsLoading(true)

    try {
      const { data, error } = await supabase
        .from('posts')
        .insert({
          author_id: user.id,
          content: content.trim(),
        })
        .select('id')
        .single()

      if (error) throw error

      if (data?.id) {
        embedPost(data.id, content.trim()).catch((err) => {
          console.warn('Post embedding failed (non-critical):', err)
        })
      }

      setContent('')
      setCharCount(0)
      router.refresh()
    } catch (error) {
      console.error('Error creating post:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    if (newContent.length <= 280) {
      setContent(newContent)
      setCharCount(newContent.length)
    }
  }

  if (!user) {
    return (
      <div className="px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-emerald-500/5 via-cyan-500/5 to-violet-500/5 border border-emerald-500/10">
          <Sparkles className="h-5 w-5 text-emerald-500" />
          <p className="text-sm text-muted-foreground">
            <button 
              onClick={() => router.push('/login')}
              className="font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              Sign in
            </button>
            {' '}to share your thoughts with the community
          </p>
        </div>
      </div>
    )
  }

  const progressPercentage = (charCount / 280) * 100
  const isNearLimit = charCount > 260
  const isOverLimit = charCount >= 280

  return (
    <form onSubmit={handleSubmit} className="border-b border-border/50">
      <div className="px-5 py-4">
        <div className="flex gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <Avatar className="h-11 w-11 ring-2 ring-transparent hover:ring-emerald-500/20 transition-all duration-200">
              <AvatarImage 
                src={user?.avatar_url} 
                alt={user?.display_name || 'User'} 
                className="object-cover"
              />
              <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-cyan-500 text-white text-sm font-semibold">
                {user?.display_name?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </div>
          
          <div className="flex-1 min-w-0">
            {/* Textarea with focus effects */}
            <div className={`
              relative rounded-xl transition-all duration-200
              ${isFocused ? 'bg-accent/30' : 'bg-transparent'}
            `}>
              <textarea
                value={content}
                onChange={handleContentChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="What is happening?!"
                className={`
                  w-full bg-transparent border-0 resize-none text-lg leading-6 
                  placeholder:text-muted-foreground/60 focus:outline-none
                  min-h-[80px] py-2
                  transition-all duration-200
                `}
                maxLength={280}
                rows={3}
              />
            </div>
            
            {/* Action bar */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
              {/* Media buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-full transition-all duration-200 hover:scale-110"
                >
                  <Image className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-full transition-all duration-200 hover:scale-110"
                >
                  <Smile className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-full transition-all duration-200 hover:scale-110"
                >
                  <BarChart3 className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-full transition-all duration-200 hover:scale-110"
                >
                  <Calendar className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-full transition-all duration-200 hover:scale-110"
                >
                  <MapPin className="h-5 w-5" />
                </button>
              </div>

              {/* Right side: Character counter + Post button */}
              <div className="flex items-center gap-4">
                {/* Character counter with circular progress */}
                {charCount > 0 && (
                  <div className="relative flex items-center justify-center">
                    {/* Background circle */}
                    <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-muted/30"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 10}`}
                        strokeDashoffset={`${2 * Math.PI * 10 * (1 - progressPercentage / 100)}`}
                        className={`
                          transition-all duration-300
                          ${isOverLimit ? 'text-red-500' : isNearLimit ? 'text-yellow-500' : 'text-emerald-500'}
                        `}
                      />
                    </svg>
                    {/* Count text */}
                    <span className={`
                      absolute text-[10px] font-medium tabular-nums
                      ${isOverLimit ? 'text-red-500' : isNearLimit ? 'text-yellow-500' : 'text-muted-foreground'}
                    `}>
                      {280 - charCount}
                    </span>
                  </div>
                )}
                
                {/* Post button */}
                <Button 
                  type="submit" 
                  disabled={isLoading || !content.trim() || charCount > 280}
                  className={`
                    h-9 px-6 rounded-full font-semibold text-sm
                    transition-all duration-200
                    ${content.trim() && charCount <= 280
                      ? 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-500/25' 
                      : 'bg-emerald-600/50 cursor-not-allowed'
                    }
                  `}
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Posting...
                    </span>
                  ) : (
                    'Post'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}
