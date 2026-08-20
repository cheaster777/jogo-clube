import 'dotenv/config';
import { createApp } from './app';
import { loadConfig } from './config';
import { createPool } from './db';

const config = loadConfig();
const pool = createPool(config);
const app = createApp(pool, config);
const server = app.listen(config.port, () => {
  console.log(JSON.stringify({ level: 'info', message: 'API iniciada', port: config.port, env: config.nodeEnv }));
});

async function shutdown(signal: string): Promise<void> {
  console.log(JSON.stringify({ level: 'info', message: 'Encerrando API', signal }));
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
