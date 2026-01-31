'use client'

import { useState } from 'react'
import { Post } from './Post'
import type { PostData } from '@/types/post'

const mockPosts: PostData[] = [
  {
    id: '1',
    author: {
      name: 'John Doe',
      handle: 'johndoe',
      avatar: undefined,
    },
    content: 'Just started working on a new project using Next.js and shadcn/ui. The development experience is amazing! 🚀 #webdev #react',
    timestamp: new Date(Date.now() - 300000).toISOString(),
    likes: 42,
    reposts: 8,
    replies: 12,
    views: 1250,
  },
  {
    id: '2',
    author: {
      name: 'Jane Smith',
      handle: 'janesmith',
      avatar: undefined,
    },
    content: 'Exploring new AI tools for developers. The possibilities are endless!',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    likes: 128,
    reposts: 24,
    replies: 45,
    views: 3200,
  },
  {
    id: '3',
    author: {
      name: 'Dev Community',
      handle: 'devcommunity',
      avatar: undefined,
    },
    content: 'Hot take: TypeScript should be the default for all new JavaScript projects. The type safety saves countless hours of debugging.',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    likes: 256,
    reposts: 89,
    replies: 134,
    views: 8500,
  },
  {
    id: '4',
    author: {
      name: 'Tech Enthusiast',
      handle: 'techie',
      avatar: undefined,
    },
    content: 'Just shipped my first full-stack app with Supabase. The built-in auth and real-time features are game changers! 🎉',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    likes: 89,
    reposts: 15,
    replies: 23,
    views: 2100,
  },
  {
    id: '5',
    author: {
      name: 'Open Source',
      handle: 'opensource',
      avatar: undefined,
    },
    content: 'Remember: every expert was once a beginner. Keep learning, keep building, keep shipping! 💪 #motivation #coding',
    timestamp: new Date(Date.now() - 14400000).toISOString(),
    likes: 512,
    reposts: 156,
    replies: 89,
    views: 12000,
  },
]

export function Feed() {
  const [posts, setPosts] = useState<PostData[]>(mockPosts)

  return (
    <main className="flex-1 border-x border-border min-h-screen max-w-[600px] mx-auto">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3">
        <h2 className="text-xl font-bold">Home</h2>
      </header>

      <div>
        {posts.map((post) => (
          <Post key={post.id} post={post} />
        ))}
      </div>
      
      <div className="p-4 text-center text-muted-foreground text-sm">
        Loading more posts...
      </div>
    </main>
  )
}
