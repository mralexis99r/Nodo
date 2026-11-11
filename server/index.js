import { existsSync } from 'node:fs';
import { createApp } from './app.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const app = createApp();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () => console.log(`Nodo API: http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () =>
    server.close(() => {
      app.locals.db.close();
      process.exit(0);
    }),
  );
}
