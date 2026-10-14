import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import dispatchApiRequest from './router.js';

const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 8787);
const bodyLimit = String(process.env.API_BODY_LIMIT || '25mb');
const allowedOrigins = new Set(
  String(process.env.CORS_ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173')
    .split(',').map((origin) => origin.trim()).filter(Boolean),
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));
app.use('/api', dispatchApiRequest);

app.use((err, _req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: `Upload is too large. Maximum request size is ${bodyLimit}.` });
  }
  return next(err);
});

const server = app.listen(port, () => {
  console.log(`[api] listening on port ${port}`);
});

server.on('close', () => {
  console.error('[api] server closed unexpectedly');
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

setInterval(() => {}, 1 << 30);
