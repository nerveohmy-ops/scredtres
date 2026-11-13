// Public & authenticated bootstrap endpoint: GET /api/catalog
import { authenticateRequest, ROLES } from '../lib/auth.js';
import {
  isTursoConfigured,
  getTursoDb,
  formatTursoError,
  mapProductRow,
  mapInfoRow,
  mapOrderRow,
  mapPromoRow,
  readSettings
} from '../lib/turso.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  res.setHeader('Cache-Control', 'no-store');

  const auth = authenticateRequest(req);
  const viewerId = auth.ok ? Number(auth.user.id) : 0;
  const role = auth.ok ? auth.role : ROLES.USER;
  const isStaff = auth.ok && (role === ROLES.ADMIN || role === ROLES.SUPPORT);

  if (!isTursoConfigured()) {
    return res.status(200).json({ ok: true, configured: false, viewerId, role });
  }

  try {
    const db = await getTursoDb();

    const [productsRes, infoRes, promoCountRes, settings] = await Promise.all([
      db.execute(`SELECT * FROM products ORDER BY created_at DESC`),
      db.execute(`SELECT * FROM info_items ORDER BY updated_at DESC`),
      db.execute(`SELECT COUNT(*) AS cnt FROM promos`),
      readSettings(db)
    ]);

    const payload = {
      ok: true,
      configured: true,
      viewerId,
      role,
      products: productsRes.rows.map(mapProductRow),
      infoItems: infoRes.rows.map(mapInfoRow),
      settings,
      hasPromos: Number(promoCountRes.rows[0]?.cnt || 0) > 0,
      myOrders: [],
      adminOrders: null,
      promos: null
    };

    if (auth.ok && viewerId > 0) {
      const myOrdersRes = await db.execute({
        sql: `SELECT * FROM orders WHERE telegram_id = ? ORDER BY timestamp DESC`,
        args: [viewerId]
      });
      payload.myOrders = myOrdersRes.rows.map(mapOrderRow);
    }

    if (isStaff) {
      const [allOrdersRes, promosRes] = await Promise.all([
        db.execute(`SELECT * FROM orders ORDER BY timestamp DESC`),
        db.execute(`SELECT * FROM promos ORDER BY created_at DESC`)
      ]);
      payload.adminOrders = allOrdersRes.rows.map(mapOrderRow);
      payload.promos = promosRes.rows.map(mapPromoRow);
    }

    return res.status(200).json(payload);
  } catch (err) {
    console.error('Catalog GET error:', err);
    return res.status(500).json({
      ok: false,
      configured: true,
      error: formatTursoError(err)
    });
  }
}
