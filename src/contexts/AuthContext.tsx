import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ApiError, ApiProfile, ApiUser, apiClient, isApiConfigured, setUnauthorizedHandler, unwrapApiData } from '../lib/api';
import { supabase, isSupabaseMode } from '../lib/supabase';

export interface User {
  id: string;
  email: string;
  email_verified?: boolean;
  [key: string]: unknown;
}

export interface Session {
  expires_at?: string | number | null;
  [key: string]: unknown;
}

export interface Profile extends ApiProfile {
  email?: string;
}

export interface GameScore {
  id: string;
  user_id: string;
  score: number;
  quality_category: string;
  quality_diagnosis: string;
  families_count: number;
  played_at: string;
  full_name?: string;
}

export interface AuthError {
  message: string;
  code?: string;
  status?: number;
  [key: string]: unknown;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  localMode: boolean;
  authError: string | null;
  isSupabase: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  resendEmailVerification: (email: string) => Promise<{ error: AuthError | null }>;
  confirmEmail: (token: string) => Promise<{ error: AuthError | null }>;
  confirmPasswordReset: (token: string, newPassword: string) => Promise<{ error: AuthError | null }>;
  saveGameScore?: (score: number, qualityCategory: string, qualityDiagnosis: string, familiesCount: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthPayload {
  user?: ApiUser | User | null;
  profile?: ApiProfile | null;
  session?: Session | null;
}

function getAuthPayload(response: unknown): AuthPayload {
  return (unwrapApiData(response as AuthPayload | { data?: AuthPayload }) as AuthPayload) || {};
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError('Não foi possível concluir a operação.', 0, 'UNKNOWN_ERROR', error);
}

function normalizeProfile(profile: ApiProfile | null | undefined, user: ApiUser | null | undefined): Profile | null {
  if (!profile || !user) return null;
  return { ...profile, email: user.email };
}

async function loadSupabaseProfile(userId: string): Promise<Profile | null> {
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
  const [authError, setAuthError] = useState<string | null>(null);

  // ==========================================
  // MODO 1: SUPABASE (Netlify em produção)
  // ==========================================
  if (isSupabaseMode) {
    return (
      <SupabaseAuthProvider
        user={user}
        setUser={setUser}
        profile={profile}
        setProfile={setProfile}
        session={session}
        setSession={setSession}
        loading={loading}
        setLoading={setLoading}
        authError={authError}
        setAuthError={setAuthError}
      >
        {children}
      </SupabaseAuthProvider>
    );
  }

  // ==========================================
  // MODO 2: API PRÓPRIA (VPS Contabo em produção)
  // ==========================================
  return (
    <ApiAuthProvider
      user={user}
      setUser={setUser}
      profile={profile}
      setProfile={setProfile}
      session={session}
      setSession={setSession}
      loading={loading}
      setLoading={setLoading}
      authError={authError}
      setAuthError={setAuthError}
    >
      {children}
    </ApiAuthProvider>
  );
}

// ----------------------------------------------------
// Provedor para o backend Supabase (Netlify)
// ----------------------------------------------------
interface ProviderProps {
  children: ReactNode;
  user: User | null;
  setUser: (u: User | null) => void;
  profile: Profile | null;
  setProfile: (p: Profile | null) => void;
  session: Session | null;
  setSession: (s: Session | null) => void;
  loading: boolean;
  setLoading: (l: boolean) => void;
  authError: string | null;
  setAuthError: (e: string | null) => void;
}

function SupabaseAuthProvider({
  children,
  user,
  setUser,
  profile,
  setProfile,
  session,
  setSession,
  loading,
  setLoading,
  authError,
}: ProviderProps) {
  useEffect(() => {
    let mounted = true;
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 6000);

    const init = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!mounted) return;

        if (currentSession?.user) {
          const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
          if (!mounted) return;

          if (userError || !currentUser) {
            await supabase.auth.signOut();
            if (mounted) {
              setSession(null);
              setUser(null);
              setProfile(null);
            }
          } else {
            setSession(currentSession as unknown as Session);
            setUser((currentUser as unknown as User) ?? null);
            const p = await loadSupabaseProfile(currentUser.id);
            if (mounted) setProfile(p);
          }
        }
      } catch (err) {
        console.warn('Erro ao inicializar sessão Supabase:', err);
      } finally {
        if (mounted) setLoading(false);
        clearTimeout(timeout);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!mounted) return;
        setSession(newSession as unknown as Session);
        setUser((newSession?.user as unknown as User) ?? null);

        if (!newSession?.user) {
          setProfile(null);
          return;
        }

        const p = await loadSupabaseProfile(newSession.user.id);
        if (mounted) {
          if (p) {
            setProfile(p);
          } else {
            // Criação de perfil de fallback caso a trigger tenha atrasado
            const u = newSession.user;
            await supabase.from('profiles').insert({
              id: u.id,
              full_name: u.user_metadata?.full_name ?? u.email ?? 'Cientista',
              email: u.email ?? '',
            });
            const retry = await loadSupabaseProfile(u.id);
            if (mounted) setProfile(retry);
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

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });
    if (error) return { error: { message: error.message, code: error.name } };
    if (data.user) {
      setUser(data.user as unknown as User);
    }
    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { error: { message: error.message, code: error.name } };
    if (data.user) {
      setUser(data.user as unknown as User);
      const p = await loadSupabaseProfile(data.user.id);
      setProfile(p);
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
    if (error) return { error: { message: error.message, code: error.name } };
    return { error: null };
  };

  const resendEmailVerification = async (email: string) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) return { error: { message: error.message, code: error.name } };
    return { error: null };
  };

  const confirmEmail = async (token: string) => {
    const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: 'email' });
    if (error) return { error: { message: error.message, code: error.name } };
    return { error: null };
  };

  const confirmPasswordReset = async (_token: string, newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: { message: error.message, code: error.name } };
    return { error: null };
  };

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
      console.error('Falha ao salvar pontuação no Supabase:', error.message);
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
        localMode: false,
        authError,
        isSupabase: true,
        signUp,
        signIn,
        signOut,
        resetPassword,
        resendEmailVerification,
        confirmEmail,
        confirmPasswordReset,
        saveGameScore,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ----------------------------------------------------
// Provedor para o backend API própria (VPS Contabo)
// ----------------------------------------------------
function ApiAuthProvider({
  children,
  user,
  setUser,
  profile,
  setProfile,
  session,
  setSession,
  loading,
  setLoading,
  authError,
  setAuthError,
}: ProviderProps) {
  const localMode = !isApiConfigured && import.meta.env.DEV;

  useEffect(() => {
    let mounted = true;

    if (localMode) {
      setLoading(false);
      return () => { mounted = false; };
    }

    const init = async () => {
      try {
        const response = getAuthPayload(await apiClient.getMe());
        if (!mounted) return;
        setUser((response.user as unknown as User) ?? null);
        setProfile(normalizeProfile(response.profile, response.user as ApiUser));
        setSession((response.session as unknown as Session) ?? null);
        setAuthError(null);
      } catch (error) {
        if (!mounted) return;
        const apiError = toApiError(error);
        if (apiError.status !== 401) setAuthError(apiError.message);
        setUser(null);
        setProfile(null);
        setSession(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();
    return () => { mounted = false; };
  }, [localMode]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setProfile(null);
      setSession(null);
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, []);

  const applyAuthResponse = (response: unknown) => {
    const payload = getAuthPayload(response);
    const nextUser = (payload.user as unknown as User) ?? null;
    setUser(nextUser);
    setProfile(normalizeProfile(payload.profile, payload.user as ApiUser));
    setSession((payload.session as unknown as Session) ?? null);
    setAuthError(null);
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const response = await apiClient.register({ email, password, fullName });
      applyAuthResponse(response);
      return { error: null };
    } catch (error) {
      return { error: toApiError(error) };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const response = await apiClient.login({ email, password });
      applyAuthResponse(response);
      return { error: null };
    } catch (error) {
      return { error: toApiError(error) };
    }
  };

  const signOut = async () => {
    if (!localMode) {
      try {
        await apiClient.logout();
      } finally {
        setUser(null);
        setProfile(null);
        setSession(null);
      }
      return;
    }

    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const resetPassword = async (email: string) => {
    try {
      await apiClient.requestPasswordReset(email);
      return { error: null };
    } catch (error) {
      return { error: toApiError(error) };
    }
  };

  const resendEmailVerification = async (email: string) => {
    try {
      await apiClient.resendEmailVerification(email);
      return { error: null };
    } catch (error) {
      return { error: toApiError(error) };
    }
  };

  const confirmEmail = async (token: string) => {
    try {
      const response = await apiClient.confirmEmail(token);
      applyAuthResponse(response);
      return { error: null };
    } catch (error) {
      return { error: toApiError(error) };
    }
  };

  const confirmPasswordReset = async (token: string, newPassword: string) => {
    try {
      await apiClient.confirmPasswordReset(token, newPassword);
      return { error: null };
    } catch (error) {
      return { error: toApiError(error) };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        localMode,
        authError,
        isSupabase: false,
        signUp,
        signIn,
        signOut,
        resetPassword,
        resendEmailVerification,
        confirmEmail,
        confirmPasswordReset,
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
