import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'feedlab - Social Feed',
  description: 'A lightweight Twitter/X-style social feed for exploring ranking systems',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased font-sans bg-background text-foreground`}>
        {children}
      </body>
    </html>
  )
}
