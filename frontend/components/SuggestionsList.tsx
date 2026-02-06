'use client'

import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { FollowButton } from './FollowButton'

interface SuggestedUser {
  id: string
  display_name: string
  username: string
  avatar_url: string | null
  isFollowing: boolean
}

interface SuggestionsListProps {
  suggestions: SuggestedUser[]
  currentUserId: string | null
}

export function SuggestionsList({ suggestions, currentUserId }: SuggestionsListProps) {
  return (
    <>
      {suggestions.map((suggestion) => (
        <Link
          key={suggestion.id}
          href={`/profile/${suggestion.username}`}
          className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 cursor-pointer transition-colors"
        >
          <Avatar className="h-10 w-10">
            <AvatarImage src={suggestion.avatar_url || undefined} alt={suggestion.display_name} />
            <AvatarFallback>{suggestion.display_name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[15px] truncate">{suggestion.display_name}</p>
            <p className="text-sm text-muted-foreground truncate">@{suggestion.username}</p>
          </div>
          <div onClick={(e) => e.preventDefault()}>
            <FollowButton
              targetUserId={suggestion.id}
              initialIsFollowing={suggestion.isFollowing}
              currentUserId={currentUserId}
            />
          </div>
        </Link>
      ))}
    </>
  )
}
