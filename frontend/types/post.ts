export interface PostData {
  id: string
  author: {
    name: string
    handle: string
    avatar?: string
  }
  content: string
  timestamp: string
  likes: number
  reposts: number
  replies: number
  views?: number
}
