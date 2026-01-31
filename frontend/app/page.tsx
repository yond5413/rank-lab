import { LeftSidebar } from '@/components/LeftSidebar'
import { Feed } from '@/components/Feed'
import { RightSidebar } from '@/components/RightSidebar'

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <LeftSidebar />
        <Feed />
        <RightSidebar />
      </div>
    </div>
  )
}
