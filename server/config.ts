export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  databaseSsl: boolean;
  databaseSslRejectUnauthorized: boolean;
  databaseSslCa: string;
  databaseStatementTimeoutMs: number;
  databaseIdleInTransactionTimeoutMs: number;
  corsOrigins: string[];
  secureCookies: boolean;
  sessionCookieName: string;
  sessionTtlSeconds: number;
  resetTokenExpose: boolean;
  bodyLimit: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  authRateLimitMax: number;
  commandRateLimitMax: number;
  trustProxy: boolean;
  appBaseUrl: string;
  emailMode: 'smtp' | 'console';
  emailFrom: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  emailTokenTtlSeconds: number;
}

function numberEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const secureCookies = env.COOKIE_SECURE === 'true' || nodeEnv === 'production';
  const origins = (env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  return {
    nodeEnv,
    port: numberEnv(env.PORT, 4000),
    databaseUrl: env.DATABASE_URL ?? '',
    databaseSsl: env.DATABASE_SSL === 'true',
    databaseSslRejectUnauthorized: env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
    databaseSslCa: env.DATABASE_SSL_CA ?? '',
    databaseStatementTimeoutMs: numberEnv(env.DATABASE_STATEMENT_TIMEOUT_MS, 15_000),
    databaseIdleInTransactionTimeoutMs: numberEnv(env.DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS, 10_000),
    corsOrigins: origins,
    secureCookies,
    sessionCookieName: env.SESSION_COOKIE_NAME ?? (secureCookies ? '__Host-session' : 'session'),
    sessionTtlSeconds: numberEnv(env.SESSION_TTL_SECONDS, 60 * 60 * 24 * 30),
    resetTokenExpose: env.RESET_TOKEN_EXPOSE === 'true' && nodeEnv !== 'production',
    bodyLimit: env.JSON_BODY_LIMIT ?? '32kb',
    rateLimitWindowMs: numberEnv(env.RATE_LIMIT_WINDOW_MS, 60_000),
    rateLimitMax: numberEnv(env.RATE_LIMIT_MAX, 120),
    authRateLimitMax: numberEnv(env.AUTH_RATE_LIMIT_MAX, 10),
    commandRateLimitMax: numberEnv(env.COMMAND_RATE_LIMIT_MAX, 60),
    trustProxy: env.TRUST_PROXY === 'true',
    appBaseUrl: (env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    emailMode: env.EMAIL_MODE === 'smtp' ? 'smtp' : 'console',
    emailFrom: env.EMAIL_FROM ?? 'Clube de Ciências <no-reply@localhost>',
    smtpHost: env.SMTP_HOST ?? '',
    smtpPort: numberEnv(env.SMTP_PORT, 587),
    smtpSecure: env.SMTP_SECURE === 'true',
    smtpUser: env.SMTP_USER ?? '',
    smtpPassword: env.SMTP_PASSWORD ?? '',
    emailTokenTtlSeconds: numberEnv(env.EMAIL_TOKEN_TTL_SECONDS, 60 * 60 * 24),
  };
}
