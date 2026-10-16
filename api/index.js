import 'dotenv/config';
import dispatchApiRequest from '../server/router.js';

async function getRequestBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body);
    } catch (_) {
      return {};
    }
  }
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return {};
  }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (_) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  try {
    if (!req.body || typeof req.body !== 'object') {
      req.body = await getRequestBody(req);
    }
    return await dispatchApiRequest(req, res);
  } catch (err) {
    console.error('[vercel-api fatal error]:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({
        error: err?.message || 'Internal server error occurred',
      });
    }
  }
}
