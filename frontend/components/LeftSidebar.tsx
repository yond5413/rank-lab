import Link from 'next/link'
import { Home, Search, User, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AuthButton } from './AuthButton'
import { createClient } from '@/lib/supabase/server'

interface NavItemProps {
  icon: React.ReactNode
  label: string
  href: string
  active?: boolean
}

function NavItem({ icon, label, href, active = false }: NavItemProps) {
  return (
    <Link href={href}>
      <Button
        variant="ghost"
        className={`w-full justify-start gap-3 h-12 rounded-full text-[15px] ${
          active ? 'font-bold' : 'font-normal'
        }`}
      >
        {icon}
        <span>{label}</span>
      </Button>
    </Link>
  )
}

export async function LeftSidebar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  let profile = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    profile = data
  }

  return (
    <aside className="hidden lg:flex flex-col h-screen sticky top-0 w-[275px] px-2 py-3 border-r border-border">
      <div className="px-3 mb-2">
        <Link href="/">
          <h1 className="text-xl font-bold tracking-tight hover:opacity-80 transition-opacity">feedlab</h1>
        </Link>
      </div>
      
      <nav className="flex flex-col gap-1 flex-1">
        <NavItem icon={<Home className="h-7 w-7" />} label="Home" href="/" />
        <NavItem icon={<Search className="h-7 w-7" />} label="Explore" href="/explore" />
        <NavItem 
          icon={<User className="h-7 w-7" />} 
          label="Profile" 
          href={profile ? `/profile/${profile.username}` : '/login'} 
        />
        <NavItem icon={<Settings className="h-7 w-7" />} label="Settings" href="/settings" />
        <AuthButton user={user ? { id: user.id, email: user.email } : null} />
      </nav>
      
      {profile && (
        <div className="px-3 py-3 border-t border-border">
          <Link href={`/profile/${profile.username}`}>
            <div className="flex items-center gap-3 p-2 rounded-full hover:bg-accent/50 cursor-pointer transition-colors">
              <Avatar className="h-10 w-10">
                <AvatarImage 
                  src={profile.avatar_url || undefined} 
                  alt={profile.display_name || 'User'} 
                />
                <AvatarFallback>
                  {profile.display_name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {profile.display_name || 'Your Name'}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  @{profile.username || 'yourhandle'}
                </p>
              </div>
            </div>
          </Link>
        </div>
      )}

      {!profile && (
        <div className="px-3 py-3 border-t border-border">
          <div className="flex items-center gap-3 p-2 rounded-full">
            <Avatar className="h-10 w-10">
              <AvatarFallback>?</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">
                <Link href="/login" className="text-emerald-500 hover:underline">Sign in</Link> to see your profile
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
