import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    // Callback pages handle code exchange explicitly.
    // Prevent automatic URL processing from consuming PKCE verifier twice.
    detectSessionInUrl: false,
  },
})
