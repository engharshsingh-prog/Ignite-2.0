import 'dotenv/config';
import express from 'express';
import dispatchApiRequest from './router.js';

const app = express();
const port = Number(process.env.API_PORT || 8787);
const bodyLimit = String(process.env.API_BODY_LIMIT || '25mb');

app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));
app.use('/api', dispatchApiRequest);

app.use((err, _req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: `Upload is too large. Maximum request size is ${bodyLimit}.` });
  }
  return next(err);
});

const server = app.listen(port, () => {
  console.log(`[api] listening on http://127.0.0.1:${port}`);
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
