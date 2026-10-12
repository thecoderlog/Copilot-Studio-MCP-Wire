import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import users from './api/users.json' with { type: 'json' };

// A tiny API served by Vite itself:  GET /api/users/:id
// Alice's answer is slowed down on purpose, so the loading state is easy to see.
const DELAY_MS = { alice: 2000 };
const DEFAULT_MS = 400;

function usersApi(req, res, next) {
  const match = req.url.match(/^\/api\/users\/(\w+)$/);
  if (!match) return next();
  const id = match[1];
  setTimeout(() => {
    const user = users[id];
    if (!user) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(user));
  }, DELAY_MS[id] ?? DEFAULT_MS);
}

const usersPlugin = {
  name: 'users-api',
  configureServer(server) {
    server.middlewares.use(usersApi);
  },
  configurePreviewServer(server) {
    server.middlewares.use(usersApi);
  },
};

export default defineConfig({
  plugins: [react(), usersPlugin],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.js',
    include: ['src/**/*.test.jsx'],
  },
});
