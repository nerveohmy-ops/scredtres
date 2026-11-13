// Promo validation endpoint: POST /api/promo
import { getClientIpHash, checkRateLimit } from '../lib/rateLimit.js';
import {
  isTursoConfigured,
  getTursoDb,
  formatTursoError,
  mapPromoRow
} from '../lib/turso.js';

const PROMO_CODE_RE = /^[A-Z0-9_-]{2,32}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const ipHash = getClientIpHash(req);
  const rate = checkRateLimit(`promo:${ipHash}`, { windowMs: 60000, max: 15 });
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(rate.retryAfterMs / 1000)));
    return res.status(429).json({
      ok: false,
      error: 'Слишком много попыток проверки промокода. Попробуйте позже.'
    });
  }

  const code = String(req.body?.code || '').trim().toUpperCase();
  if (!PROMO_CODE_RE.test(code)) {
    return res.status(400).json({ ok: false, error: 'Некорректный формат промокода' });
  }

  if (!isTursoConfigured()) {
    return res.status(200).json({ ok: false, configured: false });
  }

  try {
    const db = await getTursoDb();
    const result = await db.execute({
      sql: `SELECT * FROM promos WHERE code = ? LIMIT 1`,
      args: [code]
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, configured: true, error: 'Промокод не найден' });
    }

    return res.status(200).json({
      ok: true,
      configured: true,
      promo: mapPromoRow(result.rows[0])
    });
  } catch (err) {
    console.error('Promo API error:', err);
    return res.status(500).json({ ok: false, error: formatTursoError(err) });
  }
}
