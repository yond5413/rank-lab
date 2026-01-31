'use client'

import { Home, Search, User, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface NavItemProps {
  icon: React.ReactNode
  label: string
  active?: boolean
}

function NavItem({ icon, label, active = false }: NavItemProps) {
  return (
    <Button
      variant="ghost"
      className={`w-full justify-start gap-3 h-12 rounded-full text-[15px] ${
        active ? 'font-bold' : 'font-normal'
      }`}
    >
      {icon}
      <span>{label}</span>
    </Button>
  )
}

export function LeftSidebar() {
  return (
    <aside className="hidden lg:flex flex-col h-screen sticky top-0 w-[275px] px-2 py-3 border-r border-border">
      <div className="px-3 mb-2">
        <h1 className="text-xl font-bold tracking-tight">feedlab</h1>
      </div>
      
      <nav className="flex flex-col gap-1 flex-1">
        <NavItem icon={<Home className="h-7 w-7" />} label="Home" active />
        <NavItem icon={<Search className="h-7 w-7" />} label="Explore" />
        <NavItem icon={<User className="h-7 w-7" />} label="Profile" />
        <NavItem icon={<Settings className="h-7 w-7" />} label="Settings" />
      </nav>
      
      <div className="px-3 py-3 border-t border-border">
        <div className="flex items-center gap-3 p-2 rounded-full hover:bg-accent/50 cursor-pointer">
          <Avatar className="h-10 w-10">
            <AvatarImage src="/placeholder-avatar.png" alt="User" />
            <AvatarFallback>U</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">Your Name</p>
            <p className="text-sm text-muted-foreground truncate">@yourhandle</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
