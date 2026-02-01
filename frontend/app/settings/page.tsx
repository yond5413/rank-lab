import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LeftSidebar } from '@/components/LeftSidebar'
import { RightSidebar } from '@/components/RightSidebar'
import { createClient } from '@/lib/supabase/server'
import { SettingsForm } from './SettingsForm'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <LeftSidebar />
        
        <main className="flex-1 border-x border-border min-h-screen max-w-[600px] mx-auto">
          {/* Header */}
          <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3">
            <div className="flex items-center gap-6">
              <Link href="/">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <h2 className="text-xl font-bold">Settings</h2>
            </div>
          </header>

          {/* Settings Content */}
          <div className="p-4">
            <SettingsForm 
              profile={{
                id: profile.id,
                display_name: profile.display_name,
                username: profile.username,
                bio: profile.bio,
                avatar_url: profile.avatar_url,
              }}
              email={user.email}
            />
          </div>
        </main>

        <RightSidebar />
      </div>
    </div>
  )
}

