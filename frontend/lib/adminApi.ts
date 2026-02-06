/**
 * Admin API client for Rank Lab.
 *
 * IMPORTANT: `NEXT_PUBLIC_API_URL` is treated as the backend *base* URL
 * (e.g. http://localhost:8000). We append `/api/v1` internally to match FastAPI.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:8000'

const API_V1 = `${API_BASE}/api/v1`
const ADMIN_V1 = `${API_V1}/admin`

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Admin API ${res.status}: ${body || res.statusText}`)
  }

  return res.json() as Promise<T>
}

/**
 * Fetch from `/api/v1/admin/*`
 *
 * @example
 *   adminFetch('/weights')
 *   adminFetch(`/weight-history?${params}`)
 */
export function adminFetch<T>(path: string, options: RequestInit = {}) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return fetchJson<T>(`${ADMIN_V1}${normalized}`, options)
}

export const adminApiBase = ADMIN_V1

