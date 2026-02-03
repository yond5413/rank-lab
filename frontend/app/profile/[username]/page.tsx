import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Calendar } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Post } from '@/components/Post'
import { FollowButton } from '@/components/FollowButton'
import { LeftSidebar } from '@/components/LeftSidebar'
import { RightSidebar } from '@/components/RightSidebar'
import { createClient } from '@/lib/supabase/server'
import type { PostData } from '@/types/post'
import type { Tables } from '@/types/database'

interface ProfilePageProps {
  params: Promise<{ username: string }>
}

interface PostWithProfile extends Tables<'posts'> {
  profiles: {
    display_name: string
    username: string
    avatar_url: string | null
  } | null
}

async function getProfileByUsername(username: string) {
  const supabase = await createClient()
  
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single()

  if (error || !profile) {
    return null
  }

  return profile
}

async function getUserPosts(userId: string, currentUserId?: string): Promise<PostData[]> {
  const supabase = await createClient()
  
  // Get top-level posts only (not replies)
  const { data: posts, error } = await supabase
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
    .eq('author_id', userId)
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Error fetching user posts:', error)
    return []
  }

  // Check which posts the current user has liked
  let likedPostIds = new Set<string>()
  if (currentUserId) {
    const postIds = posts?.map(p => p.id) || []
    if (postIds.length > 0) {
      const { data: likes } = await supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', currentUserId)
        .in('post_id', postIds)
      
      likedPostIds = new Set(likes?.map(l => l.post_id) || [])
    }
  }

  return ((posts as unknown) as PostWithProfile[] || []).map((post) => ({
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
  }))
}

async function getPostCount(userId: string): Promise<number> {
  const supabase = await createClient()
  
  const { count } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('author_id', userId)

  return count || 0
}

async function checkIsFollowing(followerId: string | undefined, followingId: string): Promise<boolean> {
  if (!followerId) return false
  
  const supabase = await createClient()
  
  const { data } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle()

  return !!data
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { username } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  const profile = await getProfileByUsername(username)
  
  if (!profile) {
    notFound()
  }

  const posts = await getUserPosts(profile.id, user?.id)
  const postCount = await getPostCount(profile.id)
  const isOwnProfile = user?.id === profile.id
  const isFollowing = await checkIsFollowing(user?.id, profile.id)

  const formatJoinDate = (date: string | null) => {
    if (!date) return 'Unknown'
    return new Date(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const formatCount = (count: number | null) => {
    if (!count) return '0'
    if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M'
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K'
    return count.toString()
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <LeftSidebar />
        
        <main className="flex-1 border-x border-border min-h-screen max-w-[600px] mx-auto">
          {/* Header */}
          <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-2">
            <div className="flex items-center gap-6">
              <Link href="/">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h2 className="text-xl font-bold">{profile.display_name}</h2>
                <p className="text-sm text-muted-foreground">{postCount} posts</p>
              </div>
            </div>
          </header>

          {/* Profile Header */}
          <div className="relative">
            {/* Banner */}
            <div className="h-32 bg-gradient-to-r from-emerald-500/30 via-cyan-500/30 to-violet-500/30" />
            
            {/* Avatar */}
            <div className="px-4">
              <Avatar className="h-28 w-28 border-4 border-background -mt-14 relative">
                <AvatarImage src={profile.avatar_url || undefined} alt={profile.display_name} />
                <AvatarFallback className="text-3xl">{profile.display_name.charAt(0)}</AvatarFallback>
              </Avatar>
            </div>

            {/* Edit Profile / Follow Button */}
            <div className="absolute top-36 right-4">
              {isOwnProfile ? (
                <Link href="/settings">
                  <Button variant="outline" className="rounded-full">
                    Edit profile
                  </Button>
                </Link>
              ) : (
                <FollowButton
                  targetUserId={profile.id}
                  initialIsFollowing={isFollowing}
                  currentUserId={user?.id}
                />
              )}
            </div>
          </div>

          {/* Profile Info */}
          <div className="px-4 mt-3 pb-4 border-b border-border">
            <h1 className="text-xl font-bold">{profile.display_name}</h1>
            <p className="text-muted-foreground">@{profile.username}</p>
            
            {profile.bio && (
              <p className="mt-3 text-[15px]">{profile.bio}</p>
            )}

            <div className="flex items-center gap-4 mt-3 text-sm">
              <div className="flex items-center gap-1">
                <span className="font-bold text-foreground">{formatCount(profile.following_count)}</span>
                <span className="text-muted-foreground">Following</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-bold text-foreground">{formatCount(profile.followers_count)}</span>
                <span className="text-muted-foreground">Followers</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Joined {formatJoinDate(profile.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Posts */}
          <div>
            {posts.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p className="text-lg font-medium mb-2">No posts yet</p>
                <p className="text-sm">
                  {isOwnProfile 
                    ? "When you post, they'll show up here." 
                    : `@${profile.username} hasn't posted anything yet.`}
                </p>
              </div>
            ) : (
              posts.map((post) => (
                <Post key={post.id} post={post} currentUserId={user?.id} />
              ))
            )}
          </div>
        </main>

        <RightSidebar />
      </div>
    </div>
  )
}

