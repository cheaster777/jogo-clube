import { useRef, createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ApiError, ApiProfile, ApiUser, apiClient, isApiConfigured, setUnauthorizedHandler, unwrapApiData } from '../lib/api';

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
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null; requiresEmailVerification?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  resendEmailVerification: (email: string) => Promise<{ error: AuthError | null }>;
  confirmEmail: (token: string) => Promise<{ error: AuthError | null }>;
  confirmPasswordReset: (token: string, newPassword: string) => Promise<{ error: AuthError | null }>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

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
// Estado compartilhado pelo provedor de autenticação
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

  const hadSession = useRef(false);

  useEffect(() => {
    hadSession.current = Boolean(user);
  }, [user]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (hadSession.current) setAuthError('Sua sessão expirou. Entre novamente.');
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
      const payload = response as { requires_email_verification?: boolean; data?: { requires_email_verification?: boolean } };
      return {
        error: null,
        requiresEmailVerification: Boolean(payload.requires_email_verification ?? payload.data?.requires_email_verification),
      };
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
      } catch (error) {
        // A failed request leaves the HttpOnly cookie valid. Keep the UI
        // authenticated so the player can retry instead of promising logout.
        if (!(error instanceof ApiError && error.status === 401)) throw error;
      }
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
      // Reset revokes the target account's sessions. A link may also belong to
      // another account, so refresh our session instead of assuming its owner.
      if (user) {
        try { applyAuthResponse(await apiClient.getMe()); } catch { /* A 401 already clears the session globally. */ }
      }
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
