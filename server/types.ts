import type { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  publicName: string;
  status: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  sessionId?: string;
}

export type Queryable = {
  query: (...args: any[]) => Promise<any>;
};

export interface MatchPlayerRecord {
  id: string;
  matchId: string;
  userId: string | null;
  seat: number;
  displayName: string;
  isBot: boolean;
  status: string;
  score: number;
}
