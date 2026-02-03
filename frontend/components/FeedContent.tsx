'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { User } from '@supabase/supabase-js'
import { Post } from './Post'
import { CreatePost } from './CreatePost'
import type { PostData } from '@/types/post'
import type { Tables } from '@/types/database'

interface FeedContentProps {
  forYouPosts: PostData[]
  followingPosts: PostData[]
  user: User | null
  userProfile: Tables<'profiles'> | null
}

export function FeedContent({ forYouPosts, followingPosts, user, userProfile }: FeedContentProps) {
  const [activeTab, setActiveTab] = useState('foryou')

  return (
    <main className="flex-1 border-x border-border min-h-screen max-w-[600px] mx-auto">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="px-4 py-3">
          <h2 className="text-xl font-bold">Home</h2>
        </div>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList variant="line" className="w-full h-12 bg-transparent p-0">
            <TabsTrigger 
              value="foryou" 
              className="flex-1 h-full rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none font-medium"
            >
              For you
            </TabsTrigger>
            <TabsTrigger 
              value="following" 
              className="flex-1 h-full rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none font-medium"
            >
              Following
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <CreatePost 
        user={userProfile ? {
          id: user!.id,
          display_name: userProfile.display_name,
          username: userProfile.username,
          avatar_url: userProfile.avatar_url || undefined,
        } : null} 
      />

      <Tabs value={activeTab} className="w-full">
        <TabsContent value="foryou" className="mt-0">
          {forYouPosts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-lg font-medium mb-2">No posts yet</p>
              <p className="text-sm">Be the first to post something!</p>
            </div>
          ) : (
            <div>
              {forYouPosts.map((post) => (
                <Post key={post.id} post={post} currentUserId={user?.id} />
              ))}
            </div>
          )}
          
          {forYouPosts.length > 0 && (
            <div className="p-4 text-center text-muted-foreground text-sm">
              Loading more posts...
            </div>
          )}
        </TabsContent>

        <TabsContent value="following" className="mt-0">
          {!user ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-lg font-medium mb-2">Sign in to see posts from people you follow</p>
              <p className="text-sm">Join the conversation and follow interesting people!</p>
            </div>
          ) : followingPosts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-lg font-medium mb-2">No posts from people you follow</p>
              <p className="text-sm">Follow some users to see their posts here!</p>
            </div>
          ) : (
            <div>
              {followingPosts.map((post) => (
                <Post key={post.id} post={post} currentUserId={user?.id} />
              ))}
            </div>
          )}
          
          {user && followingPosts.length > 0 && (
            <div className="p-4 text-center text-muted-foreground text-sm">
              Loading more posts...
            </div>
          )}
        </TabsContent>
      </Tabs>
    </main>
  )
}

