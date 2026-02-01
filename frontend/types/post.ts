export interface PostData {
  id: string
  author_id: string
  author: {
    name: string
    handle: string
    avatar?: string | null
  }
  content: string
  timestamp: string | null
  likes: number
  reposts: number
  replies: number
  views?: number | null
  likes_count: number
  is_liked?: boolean
}
