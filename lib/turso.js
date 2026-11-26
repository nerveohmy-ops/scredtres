// Turso (libSQL / Serverless SQLite) client & schema helpers for SCREDTRES
import crypto from 'node:crypto';
import { createClient } from '@libsql/client/web';
import { SEED_PRODUCTS } from '../src/data/seedProducts.js';

const SEED_MARKER_KEY = 'seed_scredtres_882_v1';

export const ALLOWED_CATEGORIES = [
  'hoodies',
  'tees',
  'pants',
  'outerwear',
  'footwear',
  'accessories'
];

export const ALLOWED_ORDER_STATUSES = [
  'new',
  'buying_china',
  'shipping_china',
  'cdek_rf',
  'completed',
  'cancelled'
];

export const ORDER_STATUS_LABELS = {
  new: 'Новый заказ',
  buying_china: 'Выкупается в Китае',
  shipping_china: 'В пути из Китая',
  cdek_rf: 'Передан в СДЭК',
  completed: 'Выполнен',
  cancelled: 'Отменен'
};

export const ALLOWED_DELIVERY_METHODS = ['cdek_pvz', 'pickup_blg'];

export const ALLOWED_PAYMENT_METHODS = ['sbp_card', 'crypto', 'manager'];

export const DELIVERY_METHOD_LABELS = {
  cdek_pvz: 'СДЭК ПВЗ',
  pickup_blg: 'Благовещенск (забрать лично)',
  cdek_courier: 'Курьер',
  post_ru: 'Почта'
};

export const PAYMENT_METHOD_LABELS = {
  sbp_card: 'СБП / Карта РФ',
  crypto: 'USDT (TRC-20)',
  manager: 'Через менеджера',
  stars: 'Telegram Stars'
};

export const DEFAULT_SETTINGS = {
  freeShippingThreshold: 15000,
  standardShippingCost: 490,
  supportUsername: 'dybriansik',
  ownerUsername: 'dybriansik',
  chinaDeliveryNote: 'Одежда и обувь в наличии и под заказ из Китая'
};

const MAX_HTTP_URL_LENGTH = 2048;
const MAX_DATA_URL_LENGTH = 2000000;
const RASTER_DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i;

let cachedClient = null;
let cachedKey = '';
let schemaPromise = null;

function cleanEnvValue(raw, keyNames = []) {
  let value = (raw || '').trim();
  for (const key of keyNames) {
    if (value.startsWith(`${key}=`)) {
      value = value.slice(key.length + 1).trim();
    }
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

export function getTursoConfig() {
  const url = cleanEnvValue(
    process.env.TURSO_DATABASE_URL || process.env.LIBSQL_DATABASE_URL,
    ['TURSO_DATABASE_URL', 'LIBSQL_DATABASE_URL']
  ).replace(/\/+$/, '');

  let authToken = cleanEnvValue(
    process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN,
    ['TURSO_AUTH_TOKEN', 'LIBSQL_AUTH_TOKEN']
  );
  if (/^Bearer\s+/i.test(authToken)) {
    authToken = authToken.replace(/^Bearer\s+/i, '').trim();
  }
  authToken = authToken.replace(/\s+/g, '');

  return { url, authToken };
}

export function formatTursoError(err) {
  const msg = String(err?.message || '');
  if (err) {
    console.error('Turso database error:', err);
  }
  if (/\b401\b|unauthorized/i.test(msg)) {
    return 'Ошибка авторизации базы данных: проверьте TURSO_AUTH_TOKEN';
  }
  return 'Ошибка подключения к базе данных';
}

export function sanitizeImageUrl(url) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return '';

  // Allow strictly safe relative paths starting with '/' (not '//' or '/\') or './'
  if (trimmed.startsWith('/') || trimmed.startsWith('./')) {
    if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return '';
    if (trimmed.length > MAX_HTTP_URL_LENGTH) return '';
    return trimmed;
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('data:')) {
    if (trimmed.length > MAX_DATA_URL_LENGTH) return '';
    return RASTER_DATA_URL_RE.test(trimmed) ? trimmed : '';
  }

  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:')) {
    return '';
  }

  if (trimmed.length > MAX_HTTP_URL_LENGTH) return '';
  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname) {
      return trimmed;
    }
  } catch {
    return '';
  }
  return '';
}

export function sanitizeImagesArray(arr, maxCount = 10) {
  if (!Array.isArray(arr)) return [];
  const parsedMax = Number(maxCount);
  const limit = Number.isFinite(parsedMax) ? Math.max(0, Math.floor(parsedMax)) : 10;
  const out = [];
  for (const item of arr) {
    if (out.length >= limit) break;
    const clean = sanitizeImageUrl(item);
    if (clean) out.push(clean);
  }
  return out;
}

export function isTursoConfigured() {
  const { url, authToken } = getTursoConfig();
  return Boolean(url && authToken);
}

export async function getTursoDb() {
  const { url, authToken } = getTursoConfig();
  if (!url || !authToken) {
    throw new Error('Turso credentials are not configured');
  }

  const key = `${url}::${authToken.slice(0, 8)}`;
  if (!cachedClient || cachedKey !== key) {
    cachedClient = createClient({ url, authToken });
    cachedKey = key;
    schemaPromise = null;
  }

  if (!schemaPromise) {
    schemaPromise = ensureSchema(cachedClient).catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }
  await schemaPromise;

  return cachedClient;
}

async function ensureSchema(db) {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT DEFAULT '',
      category TEXT NOT NULL DEFAULT 'hoodies',
      availability TEXT NOT NULL DEFAULT 'pre_order',
      delivery_days TEXT DEFAULT '',
      price INTEGER NOT NULL,
      old_price INTEGER,
      sizes_json TEXT NOT NULL DEFAULT '["ONE SIZE"]',
      images_json TEXT NOT NULL DEFAULT '[]',
      description TEXT DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS info_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      tracking_number TEXT DEFAULT '',
      telegram_id INTEGER DEFAULT 0,
      customer_json TEXT NOT NULL,
      delivery_json TEXT NOT NULL,
      payment_method TEXT DEFAULT 'sbp_card',
      comment TEXT DEFAULT '',
      items_json TEXT NOT NULL,
      pricing_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS promos (
      code TEXT PRIMARY KEY,
      discount_percent INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      actor_id INTEGER DEFAULT 0,
      actor_username TEXT DEFAULT '',
      actor_role TEXT DEFAULT '',
      action TEXT NOT NULL,
      target_id TEXT DEFAULT '',
      details_json TEXT DEFAULT '{}'
    );
  `);

  await db.execute({
    sql: `INSERT OR IGNORE INTO settings (key, value) VALUES ('main', ?)`,
    args: [JSON.stringify(DEFAULT_SETTINGS)]
  });

  // One-time catalog wipe requested by owner
  const clearCatalogKey = 'clear_catalog_v1';
  const clearRes = await db.execute({
    sql: `SELECT value FROM settings WHERE key = ? LIMIT 1`,
    args: [clearCatalogKey]
  });
  if (clearRes.rows.length === 0) {
    await db.execute(`DELETE FROM products`);
    await db.execute({
      sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
      args: [clearCatalogKey, JSON.stringify({ clearedAt: new Date().toISOString() })]
    });
  }

  // One-time cleanup of marketplace copy & ensuring owner/support handle is dybriansik
  const handleMigKey = 'restore_owner_dybriansik_v1';
  const handleMigRes = await db.execute({
    sql: `SELECT value FROM settings WHERE key = ? LIMIT 1`,
    args: [handleMigKey]
  });
  if (handleMigRes.rows.length === 0) {
    const mainRes = await db.execute({
      sql: `SELECT value FROM settings WHERE key = 'main' LIMIT 1`
    });
    if (mainRes.rows.length > 0) {
      const current = safeJsonParse(mainRes.rows[0].value, {});
      const next = { ...DEFAULT_SETTINGS, ...current };
      if (!next.supportUsername || next.supportUsername.toLowerCase() === 'broknboyzclub') {
        next.supportUsername = 'dybriansik';
      }
      if (!next.ownerUsername || next.ownerUsername.toLowerCase() === 'broknboyzclub') {
        next.ownerUsername = 'dybriansik';
      }
      if (
        !next.chinaDeliveryNote ||
        /poizon|taobao|1688|dewu|оригинальн|выкуп/i.test(next.chinaDeliveryNote)
      ) {
        next.chinaDeliveryNote = DEFAULT_SETTINGS.chinaDeliveryNote;
      }
      await db.execute({
        sql: `UPDATE settings SET value = ? WHERE key = 'main'`,
        args: [JSON.stringify(next)]
      });
    }
    await db.execute({
      sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
      args: [handleMigKey, JSON.stringify({ migratedAt: new Date().toISOString() })]
    });
  }

  await ensureSeededCatalog(db);
}

export async function ensureSeededCatalog(db, seedProducts = SEED_PRODUCTS) {
  if (!Array.isArray(seedProducts) || seedProducts.length === 0) return false;
  const markerRes = await db.execute({
    sql: `SELECT value FROM settings WHERE key = ? LIMIT 1`,
    args: [SEED_MARKER_KEY]
  });
  if (markerRes.rows.length > 0) {
    if (seedProducts === SEED_PRODUCTS) {
      const fixKey = 'seed_scredtres_882_fix981';
      const fixRes = await db.execute({
        sql: `SELECT value FROM settings WHERE key = ? LIMIT 1`,
        args: [fixKey]
      });
      if (fixRes.rows.length === 0) {
        await db.execute({
          sql: `UPDATE products SET name = 'LETTER FROM DARKNESS' WHERE id = 'tg-981' AND name = 'Danya Dybriansik'`
        });
        await db.execute({
          sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
          args: [fixKey, JSON.stringify({ fixedAt: new Date().toISOString() })]
        });
      }
    }
    return false;
  }

  const CHUNK_SIZE = 80;
  for (let i = 0; i < seedProducts.length; i += CHUNK_SIZE) {
    const chunk = seedProducts.slice(i, i + CHUNK_SIZE);
    const stmts = chunk.map((p) => buildProductStatement(p, { ignoreConflict: true }));
    if (stmts.length > 0) {
      await db.batch(stmts, 'write');
    }
  }

  await db.execute({
    sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
    args: [
      SEED_MARKER_KEY,
      JSON.stringify({ seededCount: seedProducts.length, seededAt: new Date().toISOString() })
    ]
  });
  return true;
}

export async function recordAuditLog(db, { actor, action, targetId = '', details = {} } = {}) {
  if (!db || typeof db.execute !== 'function') return;
  const actorId = Number(actor?.id ?? actor?.user?.id) || 0;
  const actorUsername = String(actor?.username ?? actor?.user?.username ?? '').slice(0, 64);
  const actorRole = String(actor?.role ?? '').slice(0, 32);
  let detailsJson = '{}';
  try {
    detailsJson = JSON.stringify(details ?? {});
  } catch {
    detailsJson = '{}';
  }
  if (detailsJson.length > 4000) {
    detailsJson = JSON.stringify({ truncated: true });
  }

  try {
    await db.execute({
      sql: `INSERT INTO audit_logs (
        id, timestamp, actor_id, actor_username, actor_role, action, target_id, details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        crypto.randomUUID(),
        new Date().toISOString(),
        actorId,
        actorUsername,
        actorRole,
        String(action || 'unknown').slice(0, 64),
        String(targetId || '').slice(0, 128),
        detailsJson
      ]
    });
  } catch (err) {
    console.error('Audit log insert failed:', err);
  }
}

export function safeJsonParse(raw, fallback) {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function mapProductRow(row) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand || '',
    category: row.category || 'hoodies',
    availability: row.availability || 'pre_order',
    deliveryDays: row.delivery_days || '',
    price: Number(row.price) || 0,
    oldPrice: row.old_price !== null && row.old_price !== undefined ? Number(row.old_price) : null,
    sizes: safeJsonParse(row.sizes_json, ['ONE SIZE']),
    images: sanitizeImagesArray(safeJsonParse(row.images_json, []), 10),
    description: row.description || '',
    details: safeJsonParse(row.details_json, []),
    createdAt: row.created_at
  };
}

export function mapInfoRow(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    updatedAt: row.updated_at
  };
}

export function mapOrderRow(row) {
  return {
    orderId: row.order_id,
    timestamp: row.timestamp,
    status: row.status || 'new',
    trackingNumber: row.tracking_number || '',
    customer: safeJsonParse(row.customer_json, {}),
    delivery: safeJsonParse(row.delivery_json, {}),
    paymentMethod: row.payment_method || 'sbp_card',
    comment: row.comment || '',
    items: safeJsonParse(row.items_json, []),
    pricing: safeJsonParse(row.pricing_json, { subtotal: 0, discount: 0, shipping: 0, total: 0 })
  };
}

export function mapPromoRow(row) {
  return {
    code: row.code,
    discountPercent: Number(row.discount_percent) || 0,
    createdAt: row.created_at
  };
}

export async function readSettings(db) {
  const res = await db.execute({
    sql: `SELECT value FROM settings WHERE key = 'main' LIMIT 1`,
    args: []
  });
  const stored = safeJsonParse(res.rows[0]?.value, {});
  const safeStored = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  return {
    freeShippingThreshold:
      typeof safeStored.freeShippingThreshold === 'number' && Number.isFinite(safeStored.freeShippingThreshold)
        ? safeStored.freeShippingThreshold
        : DEFAULT_SETTINGS.freeShippingThreshold,
    standardShippingCost:
      typeof safeStored.standardShippingCost === 'number' && Number.isFinite(safeStored.standardShippingCost)
        ? safeStored.standardShippingCost
        : DEFAULT_SETTINGS.standardShippingCost,
    supportUsername:
      typeof safeStored.supportUsername === 'string' && safeStored.supportUsername.trim()
        ? safeStored.supportUsername.trim()
        : DEFAULT_SETTINGS.supportUsername,
    ownerUsername:
      typeof safeStored.ownerUsername === 'string' && safeStored.ownerUsername.trim()
        ? safeStored.ownerUsername.trim()
        : DEFAULT_SETTINGS.ownerUsername,
    chinaDeliveryNote:
      typeof safeStored.chinaDeliveryNote === 'string'
        ? safeStored.chinaDeliveryNote
        : DEFAULT_SETTINGS.chinaDeliveryNote
  };
}

export function buildProductStatement(p, { ignoreConflict = false } = {}) {
  const price = Math.max(0, Math.round(Number(p.price) || 0));
  const rawOld = p.oldPrice ? Math.round(Number(p.oldPrice)) : null;
  const oldPrice = rawOld && rawOld > price ? rawOld : null;
  const category = ALLOWED_CATEGORIES.includes(p.category) ? p.category : 'hoodies';
  const cleanImages = sanitizeImagesArray(p.images, 10);
  const cleanSizes = Array.isArray(p.sizes)
    ? Array.from(new Set(p.sizes.map((s) => String(s ?? '').trim()).filter(Boolean))).slice(0, 20)
    : [];
  const cleanDetails = Array.isArray(p.details)
    ? p.details.map((d) => String(d ?? '').trim().slice(0, 200)).filter(Boolean).slice(0, 30)
    : [];

  const insertHead = ignoreConflict
    ? `INSERT OR IGNORE INTO products (
      id, name, brand, category, availability, delivery_days,
      price, old_price, sizes_json, images_json, description, details_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    : `INSERT INTO products (
      id, name, brand, category, availability, delivery_days,
      price, old_price, sizes_json, images_json, description, details_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      brand = excluded.brand,
      category = excluded.category,
      availability = excluded.availability,
      delivery_days = excluded.delivery_days,
      price = excluded.price,
      old_price = excluded.old_price,
      sizes_json = excluded.sizes_json,
      images_json = excluded.images_json,
      description = excluded.description,
      details_json = excluded.details_json`;

  return {
    sql: insertHead,
    args: [
      String(p.id),
      String(p.name || '').trim().slice(0, 160),
      String(p.brand || '').trim().slice(0, 80),
      category,
      p.availability === 'in_stock' ? 'in_stock' : 'pre_order',
      String(p.deliveryDays || '').trim().slice(0, 80),
      price,
      oldPrice,
      JSON.stringify(cleanSizes.length ? cleanSizes : ['ONE SIZE']),
      JSON.stringify(cleanImages),
      String(p.description || '').trim().slice(0, 4000),
      JSON.stringify(cleanDetails),
      p.createdAt || new Date().toISOString()
    ]
  };
}

export function buildInfoStatement(item) {
  return {
    sql: `INSERT INTO info_items (id, title, content, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      content = excluded.content,
      updated_at = excluded.updated_at`,
    args: [
      String(item.id),
      String(item.title || '').trim().slice(0, 160),
      String(item.content || '').trim().slice(0, 8000),
      item.updatedAt || new Date().toISOString()
    ]
  };
}

export function buildOrderStatement(order) {
  const status = ALLOWED_ORDER_STATUSES.includes(order.status) ? order.status : 'new';
  const paymentMethod = ALLOWED_PAYMENT_METHODS.includes(order.paymentMethod)
    ? order.paymentMethod
    : 'sbp_card';

  return {
    sql: `INSERT INTO orders (
      order_id, timestamp, status, tracking_number, telegram_id,
      customer_json, delivery_json, payment_method, comment, items_json, pricing_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      String(order.orderId),
      order.timestamp || new Date().toISOString(),
      status,
      String(order.trackingNumber || '').slice(0, 120),
      Number(order.customer?.telegramId) || 0,
      JSON.stringify(order.customer || {}),
      JSON.stringify(order.delivery || {}),
      paymentMethod,
      String(order.comment || '').slice(0, 1000),
      JSON.stringify(Array.isArray(order.items) ? order.items : []),
      JSON.stringify(order.pricing || {})
    ]
  };
}
