'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

interface SettingsFormProps {
  profile: {
    id: string
    display_name: string
    username: string
    bio: string | null
    avatar_url: string | null
  }
  email?: string
}

export function SettingsForm({ profile, email }: SettingsFormProps) {
  const router = useRouter()
  const supabase = createClient()
  
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [username, setUsername] = useState(profile.username)
  const [bio, setBio] = useState(profile.bio || '')
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    if (!displayName.trim() || !username.trim()) {
      setError('Display name and username are required')
      setIsLoading(false)
      return
    }

    // Validate username format
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain letters, numbers, and underscores')
      setIsLoading(false)
      return
    }

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          username: username.trim().toLowerCase(),
          bio: bio.trim() || null,
          avatar_url: avatarUrl.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id)

      if (updateError) {
        if (updateError.code === '23505') {
          setError('Username is already taken')
        } else {
          throw updateError
        }
      } else {
        setSuccess(true)
        router.refresh()
      }
    } catch (err) {
      console.error('Error updating profile:', err)
      setError('Failed to update profile. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your profile information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Avatar Preview */}
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarUrl || undefined} alt={displayName} />
                <AvatarFallback className="text-2xl">{displayName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <label className="text-sm font-medium text-foreground">
                  Avatar URL
                </label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                  className="mt-1 w-full px-4 py-2 border border-input rounded-lg bg-background text-sm 
                           focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                />
              </div>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your Name"
                maxLength={50}
                className="w-full px-4 py-2 border border-input rounded-lg bg-background text-sm 
                         focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                required
              />
            </div>

            {/* Username */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Username
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="username"
                  maxLength={30}
                  className="w-full pl-8 pr-4 py-2 border border-input rounded-lg bg-background text-sm 
                           focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Letters, numbers, and underscores only
              </p>
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about yourself..."
                maxLength={160}
                rows={3}
                className="w-full px-4 py-2 border border-input rounded-lg bg-background text-sm 
                         resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
              />
              <p className="text-xs text-muted-foreground text-right">
                {bio.length}/160
              </p>
            </div>

            {/* Error/Success Messages */}
            {error && (
              <div className="p-3 text-sm bg-red-500/10 text-red-500 rounded-lg border border-red-500/20">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 text-sm bg-emerald-500/10 text-emerald-500 rounded-lg border border-emerald-500/20">
                Profile updated successfully!
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Account Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Manage your account settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-foreground">Email</p>
            <p className="text-sm text-muted-foreground">{email || 'No email'}</p>
          </div>

          <div className="pt-4 border-t border-border">
            <Button
              variant="destructive"
              onClick={handleSignOut}
              className="w-full"
            >
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

