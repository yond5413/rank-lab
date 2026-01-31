'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { TrendingUp } from 'lucide-react'

const trends = [
  { category: 'Technology', topic: '#AI', posts: '45.2K' },
  { category: 'Sports', topic: 'World Cup', posts: '32.1K' },
  { category: 'Entertainment', topic: '#NewMusic', posts: '28.5K' },
  { category: 'Business', topic: 'Stock Market', posts: '19.3K' },
  { category: 'Health', topic: '#Wellness', posts: '15.7K' },
]

const suggestions = [
  { name: 'Tech Insider', handle: '@techinsider', avatar: null },
  { name: 'News Daily', handle: '@newsdaily', avatar: null },
  { name: 'Science Hub', handle: '@sciencehub', avatar: null },
]

export function RightSidebar() {
  return (
    <aside className="hidden xl:flex flex-col gap-4 sticky top-0 h-screen py-3 pl-3 w-[350px]">
      <Card className="rounded-2xl bg-background/95 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Trends for you</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {trends.map((trend, index) => (
            <div
              key={index}
              className="px-4 py-3 hover:bg-accent/50 cursor-pointer transition-colors"
            >
              <p className="text-xs text-muted-foreground">{trend.category}</p>
              <p className="font-semibold text-[15px]">{trend.topic}</p>
              <p className="text-xs text-muted-foreground">{trend.posts} posts</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-2xl bg-background/95 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Who to follow</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              className="px-4 py-3 hover:bg-accent/50 cursor-pointer transition-colors flex items-center gap-3"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={suggestion.avatar || undefined} alt={suggestion.name} />
                <AvatarFallback>{suggestion.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[15px] truncate">{suggestion.name}</p>
                <p className="text-sm text-muted-foreground truncate">{suggestion.handle}</p>
              </div>
              <Button size="sm" variant="outline" className="rounded-full">
                Follow
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="px-4 text-xs text-muted-foreground">
        <p>© 2026 feedlab. All rights reserved.</p>
      </div>
    </aside>
  )
}
