// Legacy export - maintained for backwards compatibility
// Use @/lib/supabase/client for browser-side or @/lib/supabase/server for server-side

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
