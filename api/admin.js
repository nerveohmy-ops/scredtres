// Authenticated Admin / Support mutation endpoint: POST /api/admin
import { authenticateRequest, ROLES } from '../lib/auth.js';
import {
  ALLOWED_CATEGORIES,
  ALLOWED_DELIVERY_METHODS,
  ALLOWED_ORDER_STATUSES,
  ALLOWED_PAYMENT_METHODS,
  DEFAULT_SETTINGS,
  isTursoConfigured,
  getTursoDb,
  formatTursoError,
  sanitizeImagesArray,
  buildProductStatement,
  buildInfoStatement,
  buildOrderStatement,
  recordAuditLog
} from '../lib/turso.js';

const TG_USERNAME_RE = /^[a-zA-Z0-9_]{5,32}$/;
const PROMO_CODE_RE = /^[A-Z0-9_-]{2,32}$/;

const MAX_BACKUP_PRODUCTS = 500;
const MAX_BACKUP_INFO = 100;
const MAX_BACKUP_ORDERS = 2000;
const MAX_BACKUP_PROMOS = 200;

function isPlainObject(val) {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function validateOptionalString(val, maxLen, fieldName) {
  if (val === undefined || val === null) return { value: '' };
  if (typeof val !== 'string') return { error: `Invalid ${fieldName} type` };
  const trimmed = val.trim();
  if (trimmed.length > maxLen) {
    return { error: `${fieldName} exceeds max length (${maxLen})` };
  }
  return { value: trimmed };
}

function validateIdString(val, fieldName) {
  if (typeof val !== 'string' && typeof val !== 'number') {
    return { error: `Missing or invalid ${fieldName}` };
  }
  const clean = String(val).trim();
  if (!clean || clean.length > 100) {
    return { error: `Invalid ${fieldName}` };
  }
  return { value: clean };
}

function validateProductPayload(p) {
  if (!isPlainObject(p)) return { error: 'Invalid product payload' };

  const idCheck = validateIdString(p.id, 'id');
  if (idCheck.error) return idCheck;

  if (typeof p.name !== 'string') return { error: 'Invalid product name' };
  const name = p.name.trim();
  if (!name || name.length > 160) {
    return { error: 'Product name must be 1..160 characters' };
  }

  const brandCheck = validateOptionalString(p.brand, 80, 'brand');
  if (brandCheck.error) return brandCheck;

  const category = typeof p.category === 'string' ? p.category.trim() : '';
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return { error: 'Invalid product category' };
  }

  const availability = p.availability === undefined ? 'pre_order' : p.availability;
  if (availability !== 'in_stock' && availability !== 'pre_order') {
    return { error: 'Invalid availability' };
  }

  const deliveryDaysCheck = validateOptionalString(p.deliveryDays, 80, 'deliveryDays');
  if (deliveryDaysCheck.error) return deliveryDaysCheck;

  const price = Number(p.price);
  if (!Number.isFinite(price) || price <= 0 || price > 100000000) {
    return { error: 'Invalid product price' };
  }

  let oldPrice = null;
  if (p.oldPrice !== undefined && p.oldPrice !== null && p.oldPrice !== '') {
    const parsedOld = Number(p.oldPrice);
    if (!Number.isFinite(parsedOld) || parsedOld < 0 || parsedOld > 100000000) {
      return { error: 'Invalid oldPrice' };
    }
    const roundedPrice = Math.round(price);
    const roundedOld = Math.round(parsedOld);
    oldPrice = roundedOld > roundedPrice ? roundedOld : null;
  }

  const descCheck = validateOptionalString(p.description, 4000, 'description');
  if (descCheck.error) return descCheck;

  let sizes = ['ONE SIZE'];
  if (p.sizes !== undefined) {
    if (!Array.isArray(p.sizes)) return { error: 'sizes must be an array' };
    if (p.sizes.length > 20) return { error: 'Too many sizes (max 20)' };
    const cleanedSizes = [];
    for (const rawSize of p.sizes) {
      if (typeof rawSize !== 'string' && typeof rawSize !== 'number') {
        return { error: 'Invalid size entry' };
      }
      const s = String(rawSize).trim();
      if (s.length > 40) return { error: 'Size label too long (max 40)' };
      if (s) cleanedSizes.push(s);
    }
    sizes = cleanedSizes.length ? Array.from(new Set(cleanedSizes)) : ['ONE SIZE'];
  }

  let details = [];
  if (p.details !== undefined) {
    if (!Array.isArray(p.details)) return { error: 'details must be an array' };
    if (p.details.length > 30) return { error: 'Too many details (max 30)' };
    for (const rawDetail of p.details) {
      if (typeof rawDetail !== 'string') return { error: 'Invalid detail entry' };
      const d = rawDetail.trim();
      if (d.length > 200) return { error: 'Detail item exceeds max length (200)' };
      if (d) details.push(d);
    }
  }

  let images = [];
  if (p.images !== undefined) {
    if (!Array.isArray(p.images)) return { error: 'images must be an array' };
    if (p.images.length > 10) return { error: 'Too many images (max 10)' };
    images = sanitizeImagesArray(p.images, 10);
  }

  const createdAt =
    typeof p.createdAt === 'string' && Number.isFinite(Date.parse(p.createdAt))
      ? new Date(p.createdAt).toISOString()
      : new Date().toISOString();

  return {
    value: {
      id: idCheck.value,
      name,
      brand: brandCheck.value,
      category,
      availability,
      deliveryDays: deliveryDaysCheck.value,
      price: Math.round(price),
      oldPrice,
      sizes,
      images,
      description: descCheck.value,
      details,
      createdAt
    }
  };
}

function validateInfoPayload(item) {
  if (!isPlainObject(item)) return { error: 'Invalid info item payload' };

  const idCheck = validateIdString(item.id, 'id');
  if (idCheck.error) return idCheck;

  if (typeof item.title !== 'string') return { error: 'Invalid info title' };
  const title = item.title.trim();
  if (!title || title.length > 160) {
    return { error: 'Info title must be 1..160 characters' };
  }

  if (typeof item.content !== 'string') return { error: 'Invalid info content' };
  const content = item.content.trim();
  if (!content || content.length > 8000) {
    return { error: 'Info content must be 1..8000 characters' };
  }

  const updatedAt =
    typeof item.updatedAt === 'string' && Number.isFinite(Date.parse(item.updatedAt))
      ? new Date(item.updatedAt).toISOString()
      : new Date().toISOString();

  return {
    value: {
      id: idCheck.value,
      title,
      content,
      updatedAt
    }
  };
}

function validateSettingsPayload(raw) {
  if (!isPlainObject(raw)) return { error: 'Invalid settings payload' };

  const freeShippingThreshold =
    raw.freeShippingThreshold !== undefined
      ? Number(raw.freeShippingThreshold)
      : DEFAULT_SETTINGS.freeShippingThreshold;
  if (
    !Number.isFinite(freeShippingThreshold) ||
    freeShippingThreshold < 0 ||
    freeShippingThreshold > 10000000
  ) {
    return { error: 'Invalid freeShippingThreshold' };
  }

  const standardShippingCost =
    raw.standardShippingCost !== undefined
      ? Number(raw.standardShippingCost)
      : DEFAULT_SETTINGS.standardShippingCost;
  if (
    !Number.isFinite(standardShippingCost) ||
    standardShippingCost < 0 ||
    standardShippingCost > 1000000
  ) {
    return { error: 'Invalid standardShippingCost' };
  }

  const supportUsername =
    raw.supportUsername !== undefined
      ? String(raw.supportUsername ?? '').trim().replace(/^@+/, '')
      : DEFAULT_SETTINGS.supportUsername;
  if (!TG_USERNAME_RE.test(supportUsername)) {
    return { error: 'Invalid supportUsername' };
  }

  const ownerUsername =
    raw.ownerUsername !== undefined
      ? String(raw.ownerUsername ?? '').trim().replace(/^@+/, '')
      : DEFAULT_SETTINGS.ownerUsername;
  if (!TG_USERNAME_RE.test(ownerUsername)) {
    return { error: 'Invalid ownerUsername' };
  }

  const noteCheck =
    raw.chinaDeliveryNote !== undefined
      ? validateOptionalString(raw.chinaDeliveryNote, 500, 'chinaDeliveryNote')
      : { value: DEFAULT_SETTINGS.chinaDeliveryNote };
  if (noteCheck.error) return noteCheck;

  return {
    value: {
      freeShippingThreshold: Math.round(freeShippingThreshold),
      standardShippingCost: Math.round(standardShippingCost),
      supportUsername,
      ownerUsername,
      chinaDeliveryNote: noteCheck.value
    }
  };
}

function validatePromoPayload(pr) {
  if (!isPlainObject(pr)) return { error: 'Invalid promo payload' };
  const code = String(pr.code || '').trim().toUpperCase();
  if (!PROMO_CODE_RE.test(code)) {
    return { error: 'Invalid promo code format' };
  }
  const pct = Number(pr.discountPercent);
  if (!Number.isFinite(pct) || pct < 1 || pct > 90) {
    return { error: 'Invalid promo discountPercent (1..90)' };
  }
  const createdAt =
    typeof pr.createdAt === 'string' && Number.isFinite(Date.parse(pr.createdAt))
      ? new Date(pr.createdAt).toISOString()
      : new Date().toISOString();

  return {
    value: {
      code,
      discountPercent: Math.round(pct),
      createdAt
    }
  };
}

function validateBackupOrder(o) {
  if (!isPlainObject(o)) return { error: 'Invalid order entry in backup' };
  const idCheck = validateIdString(o.orderId, 'orderId');
  if (idCheck.error) return idCheck;

  const status = o.status === undefined ? 'new' : o.status;
  if (typeof status !== 'string' || !ALLOWED_ORDER_STATUSES.includes(status)) {
    return { error: `Invalid order status: ${String(status)}` };
  }

  const trackCheck = validateOptionalString(o.trackingNumber, 120, 'trackingNumber');
  if (trackCheck.error) return trackCheck;

  const paymentMethod = o.paymentMethod === undefined ? 'sbp_card' : o.paymentMethod;
  if (typeof paymentMethod !== 'string' || !ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
    return { error: `Invalid paymentMethod: ${String(paymentMethod)}` };
  }

  const commentCheck = validateOptionalString(o.comment, 1000, 'comment');
  if (commentCheck.error) return commentCheck;

  const rawItems = Array.isArray(o.items) ? o.items : [];
  if (rawItems.length > 50) return { error: 'Order exceeds max items (50)' };
  const items = rawItems.map((it) => ({
    id: String(it?.id ?? '').trim().slice(0, 100),
    name: String(it?.name ?? '').trim().slice(0, 160),
    size: String(it?.size ?? 'ONE SIZE').trim().slice(0, 40),
    availability: it?.availability === 'in_stock' ? 'in_stock' : 'pre_order',
    price: Math.max(0, Math.round(Number(it?.price) || 0)),
    quantity: Math.min(99, Math.max(1, Math.round(Number(it?.quantity) || 1)))
  }));

  const rawMethod = o.delivery?.method;
  const deliveryMethod = ALLOWED_DELIVERY_METHODS.includes(rawMethod) ? rawMethod : 'cdek_pvz';

  const timestamp =
    typeof o.timestamp === 'string' && Number.isFinite(Date.parse(o.timestamp))
      ? new Date(o.timestamp).toISOString()
      : new Date().toISOString();

  return {
    value: {
      orderId: idCheck.value,
      timestamp,
      status,
      trackingNumber: trackCheck.value,
      customer: {
        fullName: String(o.customer?.fullName ?? '').trim().slice(0, 120),
        phone: String(o.customer?.phone ?? '').trim().slice(0, 32),
        telegramUsername: String(o.customer?.telegramUsername ?? '').trim().slice(0, 64),
        telegramId: Number(o.customer?.telegramId) || 0
      },
      delivery: {
        method: deliveryMethod,
        city: String(o.delivery?.city ?? '').trim().slice(0, 100),
        address: String(o.delivery?.address ?? '').trim().slice(0, 300)
      },
      paymentMethod,
      comment: commentCheck.value,
      items,
      pricing: {
        subtotal: Math.max(0, Math.round(Number(o.pricing?.subtotal) || 0)),
        discount: Math.max(0, Math.round(Number(o.pricing?.discount) || 0)),
        shipping: Math.max(0, Math.round(Number(o.pricing?.shipping) || 0)),
        total: Math.max(0, Math.round(Number(o.pricing?.total) || 0)),
        promoCode:
          typeof o.pricing?.promoCode === 'string' &&
          PROMO_CODE_RE.test(o.pricing.promoCode.trim().toUpperCase())
            ? o.pricing.promoCode.trim().toUpperCase()
            : null
      }
    }
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  if (!isTursoConfigured()) {
    return res.status(503).json({ ok: false, error: 'Turso database is not configured' });
  }

  const auth = authenticateRequest(req);
  if (!auth.ok) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: valid Telegram initData required' });
  }

  const isStaff = auth.role === ROLES.ADMIN || auth.role === ROLES.SUPPORT;
  const isOwner = auth.role === ROLES.ADMIN;

  if (!isStaff) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  const { action, payload } = req.body || {};
  if (!action || typeof action !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing action' });
  }

  const actor = {
    id: Number(auth.user?.id) || 0,
    username: auth.user?.username || '',
    role: auth.role
  };

  try {
    const db = await getTursoDb();

    switch (action) {
      case 'save_product': {
        const check = validateProductPayload(payload);
        if (check.error) {
          return res.status(400).json({ ok: false, error: check.error });
        }
        await db.execute(buildProductStatement(check.value));
        await recordAuditLog(db, {
          actor,
          action: 'save_product',
          targetId: check.value.id,
          details: { name: check.value.name, category: check.value.category, price: check.value.price }
        });
        return res.status(200).json({ ok: true });
      }

      case 'delete_product': {
        const idCheck = validateIdString(payload?.productId, 'productId');
        if (idCheck.error) {
          return res.status(400).json({ ok: false, error: idCheck.error });
        }
        await db.execute({
          sql: `DELETE FROM products WHERE id = ?`,
          args: [idCheck.value]
        });
        await recordAuditLog(db, {
          actor,
          action: 'delete_product',
          targetId: idCheck.value
        });
        return res.status(200).json({ ok: true });
      }

      case 'save_info': {
        const check = validateInfoPayload(payload);
        if (check.error) {
          return res.status(400).json({ ok: false, error: check.error });
        }
        await db.execute(buildInfoStatement(check.value));
        await recordAuditLog(db, {
          actor,
          action: 'save_info',
          targetId: check.value.id,
          details: { title: check.value.title }
        });
        return res.status(200).json({ ok: true });
      }

      case 'delete_info': {
        const idCheck = validateIdString(payload?.itemId, 'itemId');
        if (idCheck.error) {
          return res.status(400).json({ ok: false, error: idCheck.error });
        }
        await db.execute({
          sql: `DELETE FROM info_items WHERE id = ?`,
          args: [idCheck.value]
        });
        await recordAuditLog(db, {
          actor,
          action: 'delete_info',
          targetId: idCheck.value
        });
        return res.status(200).json({ ok: true });
      }

      case 'update_order': {
        const { orderId, patch } = payload || {};
        const idCheck = validateIdString(orderId, 'orderId');
        if (idCheck.error || !isPlainObject(patch)) {
          return res.status(400).json({ ok: false, error: idCheck.error || 'Missing or invalid patch' });
        }

        const updates = [];
        const args = [];
        const auditDetails = {};

        if (patch.status !== undefined) {
          if (typeof patch.status !== 'string' || !ALLOWED_ORDER_STATUSES.includes(patch.status)) {
            return res.status(400).json({ ok: false, error: 'Invalid order status' });
          }
          updates.push('status = ?');
          args.push(patch.status);
          auditDetails.status = patch.status;
        }

        if (patch.trackingNumber !== undefined) {
          if (typeof patch.trackingNumber !== 'string') {
            return res.status(400).json({ ok: false, error: 'Invalid trackingNumber' });
          }
          const track = patch.trackingNumber.trim();
          if (track.length > 120) {
            return res.status(400).json({ ok: false, error: 'trackingNumber exceeds max length (120)' });
          }
          updates.push('tracking_number = ?');
          args.push(track);
          auditDetails.trackingNumber = track;
        }

        if (updates.length === 0) {
          return res.status(400).json({ ok: false, error: 'No valid order fields to update' });
        }

        args.push(idCheck.value);
        await db.execute({
          sql: `UPDATE orders SET ${updates.join(', ')} WHERE order_id = ?`,
          args
        });
        await recordAuditLog(db, {
          actor,
          action: 'update_order',
          targetId: idCheck.value,
          details: auditDetails
        });
        return res.status(200).json({ ok: true });
      }

      case 'delete_order': {
        if (!isOwner) return res.status(403).json({ ok: false, error: 'Owner permission required' });
        const idCheck = validateIdString(payload?.orderId, 'orderId');
        if (idCheck.error) {
          return res.status(400).json({ ok: false, error: idCheck.error });
        }
        await db.execute({
          sql: `DELETE FROM orders WHERE order_id = ?`,
          args: [idCheck.value]
        });
        await recordAuditLog(db, {
          actor,
          action: 'delete_order',
          targetId: idCheck.value
        });
        return res.status(200).json({ ok: true });
      }

      case 'add_promo': {
        if (!isOwner) return res.status(403).json({ ok: false, error: 'Owner permission required' });
        const check = validatePromoPayload(payload);
        if (check.error) {
          return res.status(400).json({ ok: false, error: check.error });
        }
        await db.execute({
          sql: `INSERT INTO promos (code, discount_percent, created_at)
                VALUES (?, ?, ?)
                ON CONFLICT(code) DO UPDATE SET discount_percent = excluded.discount_percent`,
          args: [check.value.code, check.value.discountPercent, check.value.createdAt]
        });
        await recordAuditLog(db, {
          actor,
          action: 'add_promo',
          targetId: check.value.code,
          details: { discountPercent: check.value.discountPercent }
        });
        return res.status(200).json({ ok: true });
      }

      case 'delete_promo': {
        if (!isOwner) return res.status(403).json({ ok: false, error: 'Owner permission required' });
        const cleanCode = String(payload?.code || '').trim().toUpperCase();
        if (!PROMO_CODE_RE.test(cleanCode)) {
          return res.status(400).json({ ok: false, error: 'Invalid promo code' });
        }
        await db.execute({
          sql: `DELETE FROM promos WHERE code = ?`,
          args: [cleanCode]
        });
        await recordAuditLog(db, {
          actor,
          action: 'delete_promo',
          targetId: cleanCode
        });
        return res.status(200).json({ ok: true });
      }

      case 'save_settings': {
        if (!isOwner) return res.status(403).json({ ok: false, error: 'Owner permission required' });
        const check = validateSettingsPayload(payload);
        if (check.error) {
          return res.status(400).json({ ok: false, error: check.error });
        }
        const nextSettings = check.value;
        await db.execute({
          sql: `INSERT INTO settings (key, value) VALUES ('main', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          args: [JSON.stringify(nextSettings)]
        });
        await recordAuditLog(db, {
          actor,
          action: 'save_settings',
          targetId: 'main',
          details: nextSettings
        });
        return res.status(200).json({ ok: true, settings: nextSettings });
      }

      case 'import_backup': {
        if (!isOwner) return res.status(403).json({ ok: false, error: 'Owner permission required' });
        if (!isPlainObject(payload)) {
          return res.status(400).json({ ok: false, error: 'Invalid backup payload' });
        }

        const statements = [];
        const counts = {};

        if (payload.products !== undefined) {
          if (!Array.isArray(payload.products) || payload.products.length > MAX_BACKUP_PRODUCTS) {
            return res.status(400).json({
              ok: false,
              error: `Invalid or oversized products array (max ${MAX_BACKUP_PRODUCTS})`
            });
          }
          const validatedProducts = [];
          for (const p of payload.products) {
            const check = validateProductPayload(p);
            if (check.error) {
              return res.status(400).json({ ok: false, error: `Backup product error: ${check.error}` });
            }
            validatedProducts.push(check.value);
          }
          statements.push(`DELETE FROM products`);
          for (const p of validatedProducts) {
            statements.push(buildProductStatement(p));
          }
          counts.products = validatedProducts.length;
        }

        if (payload.infoItems !== undefined) {
          if (!Array.isArray(payload.infoItems) || payload.infoItems.length > MAX_BACKUP_INFO) {
            return res.status(400).json({
              ok: false,
              error: `Invalid or oversized infoItems array (max ${MAX_BACKUP_INFO})`
            });
          }
          const validatedInfo = [];
          for (const item of payload.infoItems) {
            const check = validateInfoPayload(item);
            if (check.error) {
              return res.status(400).json({ ok: false, error: `Backup info error: ${check.error}` });
            }
            validatedInfo.push(check.value);
          }
          statements.push(`DELETE FROM info_items`);
          for (const item of validatedInfo) {
            statements.push(buildInfoStatement(item));
          }
          counts.infoItems = validatedInfo.length;
        }

        if (payload.orders !== undefined) {
          if (!Array.isArray(payload.orders) || payload.orders.length > MAX_BACKUP_ORDERS) {
            return res.status(400).json({
              ok: false,
              error: `Invalid or oversized orders array (max ${MAX_BACKUP_ORDERS})`
            });
          }
          const validatedOrders = [];
          for (const o of payload.orders) {
            const check = validateBackupOrder(o);
            if (check.error) {
              return res.status(400).json({ ok: false, error: `Backup order error: ${check.error}` });
            }
            validatedOrders.push(check.value);
          }
          statements.push(`DELETE FROM orders`);
          for (const o of validatedOrders) {
            statements.push(buildOrderStatement(o));
          }
          counts.orders = validatedOrders.length;
        }

        if (payload.promos !== undefined) {
          if (!Array.isArray(payload.promos) || payload.promos.length > MAX_BACKUP_PROMOS) {
            return res.status(400).json({
              ok: false,
              error: `Invalid or oversized promos array (max ${MAX_BACKUP_PROMOS})`
            });
          }
          const validatedPromos = [];
          for (const pr of payload.promos) {
            const check = validatePromoPayload(pr);
            if (check.error) {
              return res.status(400).json({ ok: false, error: `Backup promo error: ${check.error}` });
            }
            validatedPromos.push(check.value);
          }
          statements.push(`DELETE FROM promos`);
          for (const pr of validatedPromos) {
            statements.push({
              sql: `INSERT INTO promos (code, discount_percent, created_at) VALUES (?, ?, ?)`,
              args: [pr.code, pr.discountPercent, pr.createdAt]
            });
          }
          counts.promos = validatedPromos.length;
        }

        if (payload.settings !== undefined) {
          const check = validateSettingsPayload(payload.settings);
          if (check.error) {
            return res.status(400).json({ ok: false, error: `Backup settings error: ${check.error}` });
          }
          statements.push({
            sql: `INSERT INTO settings (key, value) VALUES ('main', ?)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            args: [JSON.stringify(check.value)]
          });
          counts.settingsUpdated = true;
        }

        if (statements.length > 0) {
          await db.batch(statements, 'write');
        }
        await recordAuditLog(db, {
          actor,
          action: 'import_backup',
          targetId: 'backup',
          details: counts
        });
        return res.status(200).json({ ok: true });
      }

      default:
        return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({ ok: false, error: formatTursoError(err) });
  }
}
