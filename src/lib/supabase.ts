/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Determina se o frontend deve rodar conectado ao Supabase (Netlify) ou à API própria (VPS)
export const isSupabaseMode =
  import.meta.env.VITE_BACKEND === 'supabase' ||
  (typeof window !== 'undefined' && window.location.hostname.includes('netlify.app')) ||
  (!import.meta.env.VITE_API_BASE_URL && isSupabaseConfigured);

// Cliente principal autenticado
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

// Cliente público para ranking (sem persistSession / sem lock de token)
export const supabasePublic = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);
