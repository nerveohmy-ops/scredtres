// Vercel Serverless Function - Order Persistence (Turso) + Telegram Notification
import crypto from 'node:crypto';
import { getBotToken, verifyTelegramInitData } from '../lib/auth.js';
import { getClientIpHash, checkRateLimit } from '../lib/rateLimit.js';
import {
  ALLOWED_DELIVERY_METHODS,
  ALLOWED_PAYMENT_METHODS,
  DELIVERY_METHOD_LABELS,
  PAYMENT_METHOD_LABELS,
  isTursoConfigured,
  getTursoDb,
  formatTursoError,
  buildOrderStatement,
  readSettings,
  safeJsonParse,
  sanitizeImageUrl
} from '../lib/turso.js';

function collectStaffChatIds() {
  const ids = new Set();
  const singleKeys = [process.env.ADMIN_CHAT_ID, process.env.SUPPORT_CHAT_ID];
  for (const raw of singleKeys) {
    const val = String(raw || '').trim();
    if (/^-?\d+$/.test(val)) ids.add(val);
  }
  const listKeys = [process.env.ADMIN_TG_IDS, process.env.SUPPORT_TG_IDS];
  for (const raw of listKeys) {
    if (!raw || typeof raw !== 'string') continue;
    for (const part of raw.split(',')) {
      const val = part.trim();
      if (/^\d+$/.test(val)) ids.add(val);
    }
  }
  return Array.from(ids);
}

const PROMO_CODE_RE = /^[A-Z0-9_-]{2,32}$/;

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function getHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined;
  const target = name.toLowerCase();
  if (headers[target] !== undefined) return headers[target];
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) return v;
  }
  return undefined;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const ipHash = getClientIpHash(req);
  const rate = checkRateLimit(`order:${ipHash}`, { windowMs: 60000, max: 10 });
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(rate.retryAfterMs / 1000)));
    return res.status(429).json({
      ok: false,
      error: 'Слишком много попыток оформления заказа. Подождите минуту.'
    });
  }

  const TOKEN = getBotToken();
  const API_BASE = `https://api.telegram.org/bot${TOKEN}`;

  try {
    const { orderData, initData } = req.body || {};
    const headerInit = getHeader(req.headers, 'x-telegram-init-data');
    const rawInitData =
      (typeof headerInit === 'string' && headerInit) ||
      (typeof initData === 'string' && initData) ||
      '';

    const verifiedUser = verifyTelegramInitData(rawInitData, TOKEN);
    const verifiedUserId = Number(verifiedUser?.id);
    const hasVerifiedUser = Boolean(
      verifiedUser && Number.isSafeInteger(verifiedUserId) && verifiedUserId > 0
    );

    const tursoConfigured = isTursoConfigured();
    if (tursoConfigured && !hasVerifiedUser) {
      return res.status(401).json({
        ok: false,
        configured: true,
        error: 'Для оформления заказа откройте магазин внутри Telegram (требуется авторизация)'
      });
    }

    if (
      !orderData ||
      typeof orderData !== 'object' ||
      !Array.isArray(orderData.items) ||
      orderData.items.length === 0
    ) {
      return res.status(400).json({ ok: false, error: 'Missing orderData or items' });
    }

    if (orderData.items.length > 50) {
      return res.status(400).json({ ok: false, error: 'Слишком много позиций в заказе (максимум 50)' });
    }

    const deliveryMethod = String(orderData.delivery?.method || '').trim();
    if (!ALLOWED_DELIVERY_METHODS.includes(deliveryMethod)) {
      return res.status(400).json({ ok: false, error: 'Некорректный способ доставки' });
    }

    const paymentMethod = String(orderData.paymentMethod || '').trim();
    if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ ok: false, error: 'Некорректный способ оплаты' });
    }

    const normalizedInputItems = [];
    for (const item of orderData.items) {
      const id = String(item?.id ?? '').trim();
      if (!id || id.length > 100) {
        return res.status(400).json({ ok: false, error: 'Некорректный идентификатор товара' });
      }
      const quantity = Number(item?.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        return res.status(400).json({ ok: false, error: 'Количество товара должно быть от 1 до 99' });
      }
      const size = String(item?.size || 'ONE SIZE').trim().slice(0, 40) || 'ONE SIZE';
      normalizedInputItems.push({
        id,
        size,
        quantity,
        name: String(item?.name || '').trim().slice(0, 160),
        availability: item?.availability === 'in_stock' ? 'in_stock' : 'pre_order',
        price: Math.max(0, Math.round(Number(item?.price) || 0)),
        image: typeof item?.image === 'string' ? item.image.trim().slice(0, 2048) : ''
      });
    }

    // ALWAYS generate orderId strictly on the server — ignore client orderId
    const serverOrderId = `SCRED-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const serverTimestamp = new Date().toISOString();
    const targetChatId = hasVerifiedUser ? verifiedUserId : null;

    const verifiedDisplayName = hasVerifiedUser
      ? [verifiedUser?.first_name, verifiedUser?.last_name].filter(Boolean).join(' ').trim()
      : '';
    const verifiedHandle = hasVerifiedUser && verifiedUser?.username ? `@${verifiedUser.username}` : '';
    const isPickupBlg = deliveryMethod === 'pickup_blg';

    const rawFullName = String(orderData.customer?.fullName || '').trim().slice(0, 120);
    const rawTgUsername = String(orderData.customer?.telegramUsername || '').trim().slice(0, 64);

    const sanitizedCustomer = {
      fullName: rawFullName || verifiedDisplayName || (isPickupBlg ? 'Самовывоз (Благовещенск)' : ''),
      phone: isPickupBlg ? '' : String(orderData.customer?.phone || '').trim().slice(0, 32),
      telegramUsername: rawTgUsername || verifiedHandle,
      telegramId: hasVerifiedUser ? verifiedUserId : (Number(orderData.customer?.telegramId) || 0)
    };

    const sanitizedDelivery = isPickupBlg
      ? {
          method: 'pickup_blg',
          city: 'Благовещенск',
          address: 'Забрать лично (обговор с владельцем)'
        }
      : {
          method: deliveryMethod,
          city: String(orderData.delivery?.city || '').trim().slice(0, 100),
          address: String(orderData.delivery?.address || '').trim().slice(0, 300)
        };

    if (!isPickupBlg) {
      const nameParts = sanitizedCustomer.fullName
        .split(/\s+/)
        .map((p) => p.trim())
        .filter((p) => p.length >= 2);
      if (nameParts.length < 3) {
        return res.status(400).json({
          ok: false,
          error: 'Для доставки СДЭК укажите полные ФИО (Фамилия Имя Отчество)'
        });
      }
      const phoneDigits = sanitizedCustomer.phone.replace(/\D/g, '');
      if (phoneDigits.length < 10) {
        return res.status(400).json({
          ok: false,
          error: 'Укажите корректный номер телефона получателя'
        });
      }
      if (
        sanitizedDelivery.city.length < 2 ||
        !/[a-zа-яё]/i.test(sanitizedDelivery.city) ||
        sanitizedDelivery.address.length < 4 ||
        !/[a-zа-яё]/i.test(sanitizedDelivery.address) ||
        !/\d/.test(sanitizedDelivery.address)
      ) {
        return res.status(400).json({
          ok: false,
          error: 'Укажите корректный город и адрес с номером дома для ПВЗ СДЭК'
        });
      }
    }

    const sanitizedComment = String(orderData.comment || '').trim().slice(0, 1000);
    const resolvedPaymentMethod = isPickupBlg ? 'manager' : paymentMethod;

    let finalOrder = {
      orderId: serverOrderId,
      timestamp: serverTimestamp,
      status: 'new',
      trackingNumber: '',
      customer: sanitizedCustomer,
      delivery: sanitizedDelivery,
      paymentMethod: resolvedPaymentMethod,
      comment: sanitizedComment,
      items: normalizedInputItems,
      pricing: {
        subtotal: Math.max(0, Math.round(Number(orderData.pricing?.subtotal) || 0)),
        discount: Math.max(0, Math.round(Number(orderData.pricing?.discount) || 0)),
        shipping: isPickupBlg ? 0 : Math.max(0, Math.round(Number(orderData.pricing?.shipping) || 0)),
        total: Math.max(0, Math.round(Number(orderData.pricing?.total) || 0)),
        promoCode: null
      }
    };

    let configured = false;
    let supportHandle = 'broknboyzclub';

    if (tursoConfigured) {
      configured = true;
      const db = await getTursoDb();
      const settings = await readSettings(db);
      supportHandle = (settings.supportUsername || 'broknboyzclub').trim().replace(/^@+/, '');

      const productIds = Array.from(new Set(normalizedInputItems.map((i) => i.id)));
      const dbProducts = new Map();
      if (productIds.length > 0) {
        const placeholders = productIds.map(() => '?').join(', ');
        const prodRes = await db.execute({
          sql: `SELECT id, name, price, availability, images_json FROM products WHERE id IN (${placeholders})`,
          args: productIds
        });
        for (const row of prodRes.rows) {
          dbProducts.set(row.id, row);
        }
      }

      // Reject order if ANY item id does not exist in products table
      for (const item of normalizedInputItems) {
        if (!dbProducts.has(item.id)) {
          return res.status(400).json({
            ok: false,
            configured: true,
            error: 'Один или несколько товаров отсутствуют в каталоге'
          });
        }
      }

      const verifiedItems = normalizedInputItems.map((item) => {
        const dbProd = dbProducts.get(item.id);
        const imgs = safeJsonParse(dbProd.images_json, []);
        const primaryImage = Array.isArray(imgs) && imgs.length > 0 ? sanitizeImageUrl(imgs[0]) : '';
        return {
          id: item.id,
          name: dbProd.name,
          size: item.size,
          availability: dbProd.availability,
          price: Number(dbProd.price),
          quantity: item.quantity,
          ...(primaryImage ? { image: primaryImage } : {})
        };
      });

      const subtotal = verifiedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

      let appliedPromoCode = null;
      let discount = 0;
      const requestedPromo = String(orderData.pricing?.promoCode || '').trim().toUpperCase();
      if (requestedPromo && PROMO_CODE_RE.test(requestedPromo)) {
        const promoRes = await db.execute({
          sql: `SELECT code, discount_percent FROM promos WHERE code = ? LIMIT 1`,
          args: [requestedPromo]
        });
        if (promoRes.rows.length > 0) {
          appliedPromoCode = promoRes.rows[0].code;
          discount = Math.round((subtotal * Number(promoRes.rows[0].discount_percent)) / 100);
        }
      }

      const freeThreshold = Number(settings.freeShippingThreshold ?? 15000);
      const stdShipping = Number(settings.standardShippingCost ?? 490);
      const shipping = isPickupBlg || subtotal >= freeThreshold ? 0 : stdShipping;
      const total = Math.max(0, subtotal - discount + shipping);

      finalOrder = {
        ...finalOrder,
        items: verifiedItems,
        pricing: {
          subtotal,
          discount,
          shipping,
          total,
          promoCode: appliedPromoCode
        }
      };

      await db.execute(buildOrderStatement(finalOrder));
    }

    const itemsLines = (finalOrder.items || [])
      .map((item) => {
        const typeLabel = item.availability === 'pre_order' ? 'Под заказ из Китая' : 'В наличии';
        return `• ${escapeHtml(item.name)} (${escapeHtml(item.size)}, ${typeLabel}) × ${Number(item.quantity) || 1} — ${Number(item.price || 0) * (Number(item.quantity) || 1)} ₽`;
      })
      .join('\n');

    const deliveryLabel =
      DELIVERY_METHOD_LABELS[finalOrder.delivery?.method] || 'СДЭК ПВЗ';
    const paymentLabel =
      finalOrder.delivery?.method === 'pickup_blg'
        ? 'Обговор с владельцем (@broknboyzclub)'
        : PAYMENT_METHOD_LABELS[finalOrder.paymentMethod] || 'СБП / Карта РФ';
    const deliveryText =
      finalOrder.delivery?.method === 'pickup_blg'
        ? deliveryLabel
        : `${deliveryLabel} — ${finalOrder.delivery?.city}, ${finalOrder.delivery?.address}`;
    const phoneSuffix = finalOrder.customer?.phone
      ? ` (${escapeHtml(finalOrder.customer.phone)})`
      : '';

    const buyerMessage = [
      `<b>SCREDTRES — Заказ принят: ${escapeHtml(finalOrder.orderId)}</b>`,
      '',
      itemsLines,
      '',
      `Итого: <b>${escapeHtml(finalOrder.pricing?.total ?? 0)} ₽</b>`,
      `Оплата: ${escapeHtml(paymentLabel)}`,
      `Доставка: ${escapeHtml(deliveryText)}`,
      finalOrder.comment ? `Комментарий: ${escapeHtml(finalOrder.comment)}` : null,
      '',
      `Связь с поддержкой по заказу и трек-номеру: @${escapeHtml(supportHandle)}`
    ]
      .filter((line) => line !== null)
      .join('\n');

    const adminMessage = [
      `<b>Новый заказ ${escapeHtml(finalOrder.orderId)}</b>`,
      `Клиент: ${escapeHtml(finalOrder.customer?.fullName || 'Покупатель')}${phoneSuffix}`,
      finalOrder.customer?.telegramUsername
        ? `Telegram: ${escapeHtml(finalOrder.customer.telegramUsername)}`
        : null,
      hasVerifiedUser ? `TG ID: ${verifiedUserId}` : null,
      '',
      itemsLines,
      '',
      `Сумма: <b>${escapeHtml(finalOrder.pricing?.total ?? 0)} ₽</b>`,
      `Оплата: ${escapeHtml(paymentLabel)}`,
      `Доставка: ${escapeHtml(deliveryText)}`,
      finalOrder.comment ? `Комментарий: ${escapeHtml(finalOrder.comment)}` : null
    ]
      .filter((line) => line !== null)
      .join('\n');

    const deliveries = [];
    const staffChatIds = collectStaffChatIds();

    if (TOKEN && targetChatId) {
      deliveries.push(
        fetch(`${API_BASE}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetChatId,
            text: buyerMessage,
            parse_mode: 'HTML'
          })
        })
      );
    }

    if (TOKEN && staffChatIds.length > 0) {
      for (const staffChatId of staffChatIds) {
        deliveries.push(
          fetch(`${API_BASE}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: staffChatId,
              text: adminMessage,
              parse_mode: 'HTML'
            })
          })
        );
      }
    }

    await Promise.allSettled(deliveries);

    return res.status(200).json({
      ok: true,
      configured,
      orderRecord: finalOrder,
      dispatchedToBuyer: Boolean(TOKEN && targetChatId),
      dispatchedToAdmin: Boolean(TOKEN && staffChatIds.length > 0)
    });
  } catch (err) {
    console.error('Order dispatch error:', err);
    return res.status(500).json({
      ok: false,
      error: isTursoConfigured() ? formatTursoError(err) : 'Failed to process order'
    });
  }
}
