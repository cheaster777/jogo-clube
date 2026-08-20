import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ApiError, ApiProfile, ApiUser, apiClient, isApiConfigured, unwrapApiData } from '../lib/api';

export interface User extends ApiUser {}

export interface Session {
  expires_at?: string | null;
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

type AuthError = ApiError;

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  localMode: boolean;
  authError: string | null;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  resendEmailVerification: (email: string) => Promise<{ error: AuthError | null }>;
  confirmEmail: (token: string) => Promise<{ error: AuthError | null }>;
  confirmPasswordReset: (token: string, newPassword: string) => Promise<{ error: AuthError | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthPayload {
  user?: ApiUser | null;
  profile?: ApiProfile | null;
  session?: Session | null;
}

function getAuthPayload(response: AuthPayload | { data?: AuthPayload }): AuthPayload {
  return unwrapApiData(response) || {};
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
        setUser(response.user ?? null);
        setProfile(normalizeProfile(response.profile, response.user));
        setSession(response.session ?? null);
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

  const applyAuthResponse = (response: AuthPayload | { data?: AuthPayload }) => {
    const payload = getAuthPayload(response);
    const nextUser = payload.user ?? null;
    setUser(nextUser);
    setProfile(normalizeProfile(payload.profile, nextUser));
    setSession(payload.session ?? null);
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
