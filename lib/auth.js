// Telegram WebApp initData HMAC-SHA256 verification and RBAC helpers
import crypto from 'node:crypto';

export const OWNER_USERNAME = 'dybriansik';
// SHA-256 hex digest of normalized fallback support username
const SUPPORT_USERNAME_SHA256 =
  '134406713b6038128386c5dee2d76246e4b84636d307f21b3688df240a652cba';

const DEFAULT_INIT_DATA_MAX_AGE_SEC = 86400;
const MAX_FUTURE_SKEW_SEC = 300;

export const ROLES = {
  ADMIN: 'admin',
  SUPPORT: 'support',
  USER: 'user'
};

export function getBotToken() {
  return (process.env.BOT_TOKEN || '').trim();
}

export function normalizeUsername(username) {
  if (!username || typeof username !== 'string') return '';
  return username.trim().replace(/^@+/, '').toLowerCase();
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function parseTgIdSet(rawEnv) {
  const ids = new Set();
  if (!rawEnv || typeof rawEnv !== 'string') return ids;
  for (const part of rawEnv.split(',')) {
    const trimmed = part.trim();
    if (/^\d+$/.test(trimmed)) {
      const id = Number(trimmed);
      if (Number.isSafeInteger(id) && id > 0) {
        ids.add(id);
      }
    }
  }
  return ids;
}

function getSupportHashSet() {
  const hashes = new Set([SUPPORT_USERNAME_SHA256]);
  const extra = process.env.SUPPORT_TG_HASHES;
  if (extra && typeof extra === 'string') {
    for (const part of extra.split(',')) {
      const h = part.trim().toLowerCase();
      if (/^[a-f0-9]{64}$/.test(h)) {
        hashes.add(h);
      }
    }
  }
  return hashes;
}

function isSupportUsername(normalizedUsername) {
  if (!normalizedUsername) return false;
  return getSupportHashSet().has(sha256Hex(normalizedUsername));
}

function getHeaderCaseInsensitive(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined;
  const target = name.toLowerCase();
  if (headers[target] !== undefined) return headers[target];
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) return v;
  }
  return undefined;
}

export function resolveRoleFromUsername(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return ROLES.USER;
  if (normalized === OWNER_USERNAME) return ROLES.ADMIN;
  if (isSupportUsername(normalized)) return ROLES.SUPPORT;
  return ROLES.USER;
}

export function resolveRoleFromUser(user) {
  if (!user || typeof user !== 'object') return ROLES.USER;

  const adminRaw = (process.env.ADMIN_TG_IDS || '').trim();
  const supportRaw = (process.env.SUPPORT_TG_IDS || '').trim();
  const adminIds = parseTgIdSet(adminRaw);
  const supportIds = parseTgIdSet(supportRaw);

  const numericId = Number(user.id);
  const hasValidId = Number.isSafeInteger(numericId) && numericId > 0;

  if (hasValidId && adminIds.has(numericId)) return ROLES.ADMIN;
  if (hasValidId && supportIds.has(numericId)) return ROLES.SUPPORT;

  const hasAdminAllowlist = Boolean(adminRaw.replace(/[\s,]+/g, ''));
  const hasSupportAllowlist = Boolean(supportRaw.replace(/[\s,]+/g, ''));
  const normalized = normalizeUsername(user.username);

  if (!hasAdminAllowlist && normalized === OWNER_USERNAME) {
    return ROLES.ADMIN;
  }
  if (!hasSupportAllowlist && isSupportUsername(normalized)) {
    return ROLES.SUPPORT;
  }

  return ROLES.USER;
}

function getInitDataMaxAgeSec() {
  const raw = (process.env.INIT_DATA_MAX_AGE_SEC ?? '').trim();
  if (!raw) return DEFAULT_INIT_DATA_MAX_AGE_SEC;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_INIT_DATA_MAX_AGE_SEC;
}

export function verifyTelegramInitData(initData, botToken = getBotToken()) {
  if (!initData || typeof initData !== 'string' || !botToken) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null;

    params.delete('hash');
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const providedBuf = Buffer.from(hash, 'hex');
    const expectedBuf = Buffer.from(expectedHash, 'hex');
    if (providedBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null;

    const rawAuthDate = params.get('auth_date');
    if (!rawAuthDate || !/^\d+$/.test(rawAuthDate)) return null;
    const authDate = Number(rawAuthDate);
    if (!Number.isSafeInteger(authDate) || authDate <= 0) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    const maxAgeSec = getInitDataMaxAgeSec();
    if (nowSec - authDate > maxAgeSec) return null;
    if (authDate - nowSec > MAX_FUTURE_SKEW_SEC) return null;

    const rawUser = params.get('user');
    if (!rawUser) return {};
    const parsedUser = JSON.parse(rawUser);
    if (!parsedUser || typeof parsedUser !== 'object' || Array.isArray(parsedUser)) {
      return null;
    }
    return parsedUser;
  } catch {
    return null;
  }
}

export function authenticateRequest(req) {
  const headerInitData = getHeaderCaseInsensitive(req?.headers, 'x-telegram-init-data');
  const initData =
    (typeof headerInitData === 'string' && headerInitData) ||
    (typeof req?.body?.initData === 'string' && req.body.initData) ||
    '';

  const user = verifyTelegramInitData(initData);
  const numericId = Number(user?.id);
  if (!user || !Number.isSafeInteger(numericId) || numericId <= 0) {
    return { ok: false, user: null, role: ROLES.USER };
  }

  return {
    ok: true,
    user,
    role: resolveRoleFromUser(user)
  };
}
