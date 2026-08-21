import express, { type Request, type Response } from 'express';
import type { Pool } from 'pg';
import type { AppConfig } from './config';
import { checkDatabase } from './db';
import { errorHandler } from './errors';
import { createApiRouter } from './routes';

export function createApp(pool: Pool, config: AppConfig) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use((req: Request, res: Response, next) => {
    const origin = req.headers.origin;
    const isSafeMethod = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
    if (!isSafeMethod && origin && !config.corsOrigins.includes(origin)) {
      res.status(403).json({ error: { code: 'CSRF_ORIGIN', message: 'Origem da solicitação não autorizada.' } });
      return;
    }
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: config.bodyLimit }));

  app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', async (_req, res) => {
    try {
      await checkDatabase(pool);
      res.json({ status: 'ok', database: 'ok' });
    } catch (error) {
      console.error('[api] banco indisponível', error instanceof Error ? error.message : error);
      res.status(503).json({ status: 'unavailable', database: 'unavailable' });
    }
  });

  app.use('/api/v1', createApiRouter(pool, config));
  app.use(errorHandler);
  return app;
}
