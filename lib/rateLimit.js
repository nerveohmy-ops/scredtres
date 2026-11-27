// In-memory bounded sliding-window rate limiter for serverless endpoints
import crypto from 'node:crypto';

const MAX_BUCKETS = 5000;
const CLEANUP_INTERVAL = 100;
const buckets = new Map();
let callCounter = 0;

function getHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined;
  const target = name.toLowerCase();
  if (headers[target] !== undefined) return headers[target];
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) return v;
  }
  return undefined;
}

export function getClientIpHash(req) {
  const vercelXff = getHeader(req?.headers, 'x-vercel-forwarded-for');
  const vercelIp =
    typeof vercelXff === 'string'
      ? vercelXff.split(',')[0].trim()
      : Array.isArray(vercelXff)
      ? String(vercelXff[0] || '').trim()
      : '';
  const xRealIp = getHeader(req?.headers, 'x-real-ip');
  const realIp = typeof xRealIp === 'string' ? xRealIp.trim() : '';
  const xff = getHeader(req?.headers, 'x-forwarded-for');
  const firstForwarded =
    typeof xff === 'string' ? xff.split(',')[0].trim() : Array.isArray(xff) ? String(xff[0] || '').trim() : '';
  const socketIp = String(req?.socket?.remoteAddress || req?.connection?.remoteAddress || '').trim();

  const rawIp = vercelIp || realIp || firstForwarded || socketIp || 'unknown';
  return crypto.createHash('sha256').update(rawIp, 'utf8').digest('hex');
}

function pruneExpired(now) {
  for (const [k, entry] of buckets.entries()) {
    if (!entry || entry.expiresAt <= now) {
      buckets.delete(k);
    }
  }
}

function enforceCapacity(now) {
  if (buckets.size < MAX_BUCKETS) return;
  pruneExpired(now);
  while (buckets.size >= MAX_BUCKETS) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey === undefined) break;
    buckets.delete(oldestKey);
  }
}

export function checkRateLimit(key, { windowMs = 60000, max = 30 } = {}) {
  const now = Date.now();
  const safeWindowMs = Number.isFinite(Number(windowMs)) && Number(windowMs) > 0 ? Number(windowMs) : 60000;
  const safeMax = Number.isFinite(Number(max)) ? Math.max(0, Math.floor(Number(max))) : 30;
  const safeKey = String(key || 'default');

  if (safeMax === 0) {
    return {
      ok: false,
      allowed: false,
      remaining: 0,
      resetAt: now + safeWindowMs,
      retryAfterMs: safeWindowMs
    };
  }

  callCounter += 1;
  if (callCounter % CLEANUP_INTERVAL === 0 && buckets.size > 500) {
    pruneExpired(now);
  }

  const cutoff = now - safeWindowMs;
  let entry = buckets.get(safeKey);
  if (entry) {
    while (entry.hits.length > 0 && entry.hits[0] <= cutoff) {
      entry.hits.shift();
    }
    buckets.delete(safeKey);
  } else {
    enforceCapacity(now);
    entry = { hits: [], expiresAt: now + safeWindowMs };
  }

  if (entry.hits.length >= safeMax) {
    const oldestHit = entry.hits[0];
    const resetAt = oldestHit + safeWindowMs;
    entry.expiresAt = resetAt;
    buckets.set(safeKey, entry);
    return {
      ok: false,
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterMs: Math.max(1, resetAt - now)
    };
  }

  entry.hits.push(now);
  entry.expiresAt = now + safeWindowMs;
  buckets.set(safeKey, entry);

  return {
    ok: true,
    allowed: true,
    remaining: Math.max(0, safeMax - entry.hits.length),
    resetAt: entry.hits[0] + safeWindowMs,
    retryAfterMs: 0
  };
}
