import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
}

export interface GameScore {
  id: string;
  user_id: string;
  score: number;
  quality_category: string;
  quality_diagnosis: string;
  families_count: number;
  played_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  saveGameScore: (score: number, qualityCategory: string, qualityDiagnosis: string, familiesCount: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function loadProfile(userId: string): Promise<Profile | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) return data as Profile;
    if (attempt < 3) await new Promise(r => setTimeout(r, 800));
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen for auth state changes
  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 8000);
    let mounted = true;

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!mounted) return;

        if (session?.user) {
          // Validate session by fetching the user from Supabase API
          const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();

          if (!mounted) return;

          if (userError || !currentUser) {
            // Session token is stale/invalid — clear it
            await supabase.auth.signOut();
            if (mounted) {
              setSession(null);
              setUser(null);
              setProfile(null);
            }
          } else {
            setSession(session);
            setUser(currentUser);

            const profileData = await loadProfile(currentUser.id);
            if (mounted) {
              if (profileData) {
                setProfile(profileData);
              } else {
                console.error("Não foi possível carregar o perfil no init.");
                // Profile missing — sign out to avoid broken state
                await supabase.auth.signOut();
                setSession(null);
                setUser(null);
                setProfile(null);
              }
            }
          }
        }
      } catch {
        if (mounted) {
          setUser(null);
          setProfile(null);
          setSession(null);
        }
      }
      if (mounted) setLoading(false);
      clearTimeout(timeout);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);

        if (!session?.user) {
          setProfile(null);
          return;
        }

        const profileData = await loadProfile(session.user.id);
        if (mounted) {
          if (profileData) {
            setProfile(profileData);
          } else {
            console.error("Não foi possível carregar o perfil após login.");
            setProfile(null);
          }
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // Sign up with email + password + full name
  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    return { error };
  };

  // Sign in with email + password
  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  // Sign out — clear session and state
  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  // Reset password
  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    return { error };
  };

  // Save game score — throws on failure so caller can show error UI
  const saveGameScore = async (
    score: number,
    qualityCategory: string,
    qualityDiagnosis: string,
    familiesCount: number
  ) => {
    if (!user) return;

    const { error } = await supabase.from('game_scores').insert({
      user_id: user.id,
      score,
      quality_category: qualityCategory,
      quality_diagnosis: qualityDiagnosis,
      families_count: familiesCount,
    });

    if (error) {
      console.error('Failed to save score:', error.message);
      throw new Error(error.message);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signUp,
        signIn,
        signOut,
        resetPassword,
        saveGameScore,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
