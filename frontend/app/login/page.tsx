'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isSignUp, setIsSignUp] = useState(false)

  const supabase = typeof window !== 'undefined' ? createClient() : null

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!supabase) {
      setError('Client not initialized')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    } else {
      router.push('/')
      router.refresh()
    }

    setLoading(false)
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!supabase) {
      setError('Client not initialized')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('Check your email for the confirmation link!')
    }

    setLoading(false)
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError(null)

    if (!supabase) {
      setError('Client not initialized')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
          {/* Animated orbs */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-violet-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        </div>
        
        {/* Grid pattern overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-white">
              feed<span className="text-emerald-400">lab</span>
            </h1>
          </div>

          <div className="space-y-6">
            <h2 className="text-5xl font-bold text-white leading-tight">
              Join the<br />
              conversation.
            </h2>
            <p className="text-xl text-zinc-400 max-w-md">
              Share your thoughts, discover ideas, and connect with a community 
              exploring new ways to engage.
            </p>
          </div>

          <div className="flex items-center gap-3 text-zinc-500 text-sm">
            <div className="flex -space-x-2">
              {[...Array(4)].map((_, i) => (
                <div 
                  key={i}
                  className="w-8 h-8 rounded-full border-2 border-zinc-800 bg-gradient-to-br from-zinc-600 to-zinc-700"
                  style={{ 
                    animationDelay: `${i * 0.1}s`,
                    background: ['linear-gradient(135deg, #10b981, #059669)', 
                                 'linear-gradient(135deg, #06b6d4, #0891b2)',
                                 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                                 'linear-gradient(135deg, #f59e0b, #d97706)'][i]
                  }}
                />
              ))}
            </div>
            <span>2,000+ members already sharing</span>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-3xl font-black tracking-tighter">
              feed<span className="text-emerald-500">lab</span>
            </h1>
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">
              {isSignUp ? 'Create an account' : 'Welcome back'}
            </h2>
            <p className="text-muted-foreground">
              {isSignUp 
                ? 'Enter your details to get started' 
                : 'Enter your credentials to access your feed'}
            </p>
          </div>

          {error && (
            <div className="p-4 text-sm bg-red-500/10 text-red-500 rounded-lg border border-red-500/20 animate-in fade-in slide-in-from-top-2 duration-300">
              {error}
            </div>
          )}
          {message && (
            <div className="p-4 text-sm bg-emerald-500/10 text-emerald-500 rounded-lg border border-emerald-500/20 animate-in fade-in slide-in-from-top-2 duration-300">
              {message}
            </div>
          )}

          <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-input rounded-lg bg-background text-sm 
                         ring-offset-background placeholder:text-muted-foreground 
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 
                         focus-visible:border-emerald-500 transition-all duration-200"
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-input rounded-lg bg-background text-sm 
                         ring-offset-background placeholder:text-muted-foreground 
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 
                         focus-visible:border-emerald-500 transition-all duration-200"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-medium 
                       rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-emerald-500/25"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {isSignUp ? 'Creating account...' : 'Signing in...'}
                </span>
              ) : (
                isSignUp ? 'Create Account' : 'Sign In'
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-3 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-12 font-medium rounded-lg transition-all duration-200 
                     hover:bg-accent hover:border-emerald-500/30"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError(null)
                setMessage(null)
              }}
              className="text-emerald-500 hover:text-emerald-400 font-medium transition-colors"
            >
              {isSignUp ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
