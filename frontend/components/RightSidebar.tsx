import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'

interface TrendingHashtag {
  tag: string
  count: number
}

interface SuggestedUser {
  id: string
  display_name: string
  username: string
  avatar_url: string | null
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

async function getSuggestedUsers(): Promise<SuggestedUser[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  // Get random profiles (excluding current user)
  let query = supabase
    .from('profiles')
    .select('id, display_name, username, avatar_url')
    .limit(3)

  if (user) {
    query = query.neq('id', user.id)
  }

  const { data: profiles } = await query

  return profiles || []
}

export async function RightSidebar() {
  const trends = await getTrendingHashtags()
  const suggestions = await getSuggestedUsers()

  return (
    <aside className="hidden xl:flex flex-col gap-4 sticky top-0 h-screen py-3 pl-3 w-[350px]">
      {/* Trends Section */}
      <Card className="rounded-2xl bg-background/95 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Trends for you</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {trends.length === 0 ? (
            <div className="px-4 py-3 text-muted-foreground text-sm">
              No trending topics yet. Start posting with hashtags!
            </div>
          ) : (
            trends.map((trend, index) => (
              <Link
                key={index}
                href={`/explore?q=${encodeURIComponent(trend.tag)}`}
                className="block px-4 py-3 hover:bg-accent/50 cursor-pointer transition-colors"
              >
                <p className="text-xs text-muted-foreground">Trending</p>
                <p className="font-semibold text-[15px]">{trend.tag}</p>
                <p className="text-xs text-muted-foreground">{trend.count} posts</p>
              </Link>
            ))
          )}
          {trends.length > 0 && (
            <Link
              href="/explore"
              className="block px-4 py-3 text-emerald-500 hover:bg-accent/50 transition-colors text-sm"
            >
              Show more
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Who to Follow Section */}
      <Card className="rounded-2xl bg-background/95 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Who to follow</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {suggestions.length === 0 ? (
            <div className="px-4 py-3 text-muted-foreground text-sm">
              No suggestions available yet.
            </div>
          ) : (
            suggestions.map((suggestion) => (
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
                <Button size="sm" variant="outline" className="rounded-full" onClick={(e) => e.preventDefault()}>
                  Follow
                </Button>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <div className="px-4 text-xs text-muted-foreground">
        <p>© 2026 feedlab. All rights reserved.</p>
      </div>
    </aside>
  )
}
