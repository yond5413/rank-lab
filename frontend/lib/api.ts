/**
 * Backend API client for the Rank Lab recommendation engine.
 *
 * All calls go to the FastAPI backend (NEXT_PUBLIC_API_URL env var,
 * defaulting to http://localhost:8000).
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ||
  'http://localhost:8000'

const API_V1 = `${API_BASE}/api/v1`

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecommendedPost {
  id: string
  text: string
  author_id: string
  is_in_network: boolean
}

export interface RecommendationResponse {
  user_id: string
  posts: RecommendedPost[]
  scores: number[]
  total_candidates: number
  processing_time_ms: number
}

export interface EngagementPayload {
  user_id: string
  post_id: string
  event_type:
    | 'like'
    | 'reply'
    | 'repost'
    | 'not_interested'
    | 'block_author'
    | 'mute_author'
    | 'view'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_V1}${path}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${body}`)
  }

  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a ranked feed for the given user.
 */
export async function getRecommendations(
  userId: string,
  limit = 30,
): Promise<RecommendationResponse> {
  return apiFetch<RecommendationResponse>('/recommend', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, limit }),
  })
}

/**
 * Log an engagement event (like, reply, repost, etc.) so the
 * recommendation engine can learn from it.
 */
export async function logEngagement(
  payload: EngagementPayload,
): Promise<{ status: string; event_id: string | null }> {
  return apiFetch('/engage', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * Ask the backend to compute and store an embedding for a newly created post.
 */
export async function embedPost(
  postId: string,
  content: string,
): Promise<{ status: string; post_id: string; dimension: number }> {
  return apiFetch('/embed-post', {
    method: 'POST',
    body: JSON.stringify({ post_id: postId, content }),
  })
}

/**
 * Health check.
 */
export async function healthCheck(): Promise<{ status: string }> {
  return apiFetch('/health')
}
