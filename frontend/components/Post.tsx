import { MessageCircle, Repeat2, Heart, Share } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { PostData } from '@/types/post'

interface PostProps {
  post: PostData
}

export function Post({ post }: PostProps) {
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diffInSeconds < 60) return `${diffInSeconds}s`
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`
    return `${Math.floor(diffInSeconds / 86400)}d`
  }

  return (
    <article className="flex gap-3 px-4 py-3 border-b border-border hover:bg-accent/50 transition-colors cursor-pointer">
      <Avatar className="h-10 w-10 flex-shrink-0">
        <AvatarImage src={post.author.avatar} alt={post.author.name} />
        <AvatarFallback>{post.author.name.charAt(0)}</AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-bold text-foreground truncate">{post.author.name}</span>
          <span className="text-muted-foreground truncate">@{post.author.handle}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{formatTimestamp(post.timestamp)}</span>
        </div>
        
        <p className="text-[15px] leading-relaxed mt-1 whitespace-pre-wrap break-words text-foreground">
          {post.content}
        </p>
        
        <div className="flex justify-between mt-3 max-w-md">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10">
            <MessageCircle className="h-5 w-5" />
            {post.replies > 0 && <span className="text-xs ml-1">{post.replies}</span>}
          </Button>
          
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:text-green-500 hover:bg-green-500/10">
            <Repeat2 className="h-5 w-5" />
            {post.reposts > 0 && <span className="text-xs ml-1">{post.reposts}</span>}
          </Button>
          
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:text-pink-500 hover:bg-pink-500/10">
            <Heart className="h-5 w-5" />
            {post.likes > 0 && <span className="text-xs ml-1">{post.likes}</span>}
          </Button>
          
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10">
            <Share className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </article>
  )
}
