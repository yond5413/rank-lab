import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that don't require authentication
const publicRoutes = ['/login', '/auth/callback']

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const { pathname } = request.nextUrl

  // Check if environment variables are set
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase environment variables not set, skipping session update')
    return supabaseResponse
  }

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({
              request,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // Get the user session
    const { data: { user } } = await supabase.auth.getUser()

    const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

    // If user is not authenticated and trying to access a protected route
    if (!user && !isPublicRoute) {
      const redirectUrl = new URL('/login', request.url)
      return NextResponse.redirect(redirectUrl)
    }

    // If user is authenticated and trying to access login page, redirect to home
    if (user && pathname === '/login') {
      const redirectUrl = new URL('/', request.url)
      return NextResponse.redirect(redirectUrl)
    }

  } catch (error) {
    console.error('Error updating session:', error)
  }

  return supabaseResponse
}
