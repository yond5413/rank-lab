import { createClient } from '@/lib/supabase/server'
import { Post } from '@/components/Post'
import { LeftSidebar } from '@/components/LeftSidebar'
import { RightSidebar } from '@/components/RightSidebar'
import type { PostData } from '@/types/post'
import type { Tables } from '@/types/database'
import { redirect } from 'next/navigation'
import { Bookmark, BookmarkX } from 'lucide-react'

interface BookmarkedPostWithProfile {
  bookmark_id: string
  user_id: string
  bookmarked_at: string
  post_id: string
  author_id: string
  content: string
  post_created_at: string
  likes_count: number | null
  reply_count: number | null
  repost_count: number | null
  view_count: number | null
  thread_depth: number | null
  root_post_id: string | null
  author_name: string
  author_username: string
  author_avatar: string | null
}

async function getBookmarkedPosts(userId: string): Promise<PostData[]> {
  const supabase = await createClient()
  
  // Get bookmarked posts using the view we created
  const { data: bookmarkedPosts, error } = await supabase
    .from('user_bookmarks')
    .select('*')
    .eq('user_id', userId)
    .order('bookmarked_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Error fetching bookmarked posts:', error)
    return []
  }

  // Check which posts the user has liked
  let likedPostIds = new Set<string>()
  if (bookmarkedPosts && bookmarkedPosts.length > 0) {
    const postIds = bookmarkedPosts.map(bp => bp.post_id)
    const { data: likes } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_id', userId)
      .in('post_id', postIds)
    
    likedPostIds = new Set(likes?.map(l => l.post_id) || [])
  }

  // Transform data to match PostData interface
  return (bookmarkedPosts as BookmarkedPostWithProfile[] || []).map((bookmark) => ({
    id: bookmark.post_id,
    author_id: bookmark.author_id,
    author: {
      name: bookmark.author_name || 'Unknown',
      handle: bookmark.author_username || 'unknown',
      avatar: bookmark.author_avatar,
    },
    content: bookmark.content,
    timestamp: bookmark.post_created_at,
    likes: bookmark.likes_count || 0,
    likes_count: bookmark.likes_count || 0,
    reposts: bookmark.repost_count || 0,
    replies: bookmark.reply_count || 0,
    views: bookmark.view_count || 0,
    is_liked: likedPostIds.has(bookmark.post_id),
    is_bookmarked: true, // All posts on this page are bookmarked
    bookmarks_count: 0, // We don't need to show bookmark count here
  }))
}

export default async function BookmarksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Redirect to login if not authenticated
  if (!user) {
    redirect('/login')
  }

  const bookmarkedPosts = await getBookmarkedPosts(user.id)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl flex">
        <LeftSidebar />
        
        <main className="flex-1 border-x border-border min-h-screen max-w-[600px] mx-auto">
          <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <Bookmark className="h-6 w-6 text-yellow-600" />
              <div>
                <h2 className="text-xl font-bold">Bookmarks</h2>
                <p className="text-sm text-muted-foreground">
                  {bookmarkedPosts.length} {bookmarkedPosts.length === 1 ? 'post' : 'posts'} saved
                </p>
              </div>
            </div>
          </header>

          {bookmarkedPosts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <div className="flex flex-col items-center gap-4">
                <BookmarkX className="h-16 w-16 text-muted-foreground/50" />
                <div>
                  <p className="text-lg font-medium mb-2">No bookmarks yet</p>
                  <p className="text-sm max-w-md">
                    When you bookmark posts, they'll show up here. 
                    Bookmarks are private and only visible to you.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {bookmarkedPosts.map((post) => (
                <Post key={post.id} post={post} currentUserId={user.id} />
              ))}
              
              {/* Load more indicator */}
              {bookmarkedPosts.length >= 50 && (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  <p>Showing latest 50 bookmarks</p>
                </div>
              )}
            </div>
          )}
        </main>

        <RightSidebar />
      </div>
    </div>
  )
}