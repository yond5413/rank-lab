import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { SuggestionsList } from './SuggestionsList'

interface TrendingHashtag {
  tag: string
  count: number
}

interface SuggestedUser {
  id: string
  display_name: string
  username: string
  avatar_url: string | null
  isFollowing: boolean
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

async function getSuggestedUsers(currentUserId: string | null): Promise<SuggestedUser[]> {
  const supabase = await createClient()
  
  // Get random profiles (excluding current user)
  let query = supabase
    .from('profiles')
    .select('id, display_name, username, avatar_url')
    .limit(3)

  if (currentUserId) {
    query = query.neq('id', currentUserId)
  }

  const { data: profiles } = await query

  if (!profiles || profiles.length === 0) return []

  // Check follow status if user is logged in
  let followingIds: Set<string> = new Set()
  if (currentUserId) {
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', currentUserId)
      .in('following_id', profiles.map(p => p.id))

    if (follows) {
      followingIds = new Set(follows.map(f => f.following_id))
    }
  }

  return profiles.map(profile => ({
    ...profile,
    isFollowing: followingIds.has(profile.id)
  }))
}

export async function RightSidebar() {
  const supabase = await createClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  const currentUserId = currentUser?.id || null
  
  const trends = await getTrendingHashtags()
  const suggestions = await getSuggestedUsers(currentUserId)

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
            <SuggestionsList suggestions={suggestions} currentUserId={currentUserId} />
          )}
        </CardContent>
      </Card>

      <div className="px-4 text-xs text-muted-foreground">
        <p>© 2026 feedlab. All rights reserved.</p>
      </div>
    </aside>
  )
}
