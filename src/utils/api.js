// Frontend API client for Turso-backed Vercel endpoints (with clean local fallback)
import { tg } from './telegram';

async function parseJsonSafe(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchCatalogBootstrap() {
  try {
    const res = await fetch('/api/catalog', {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'x-telegram-init-data': tg?.initData || ''
      }
    });
    const data = await parseJsonSafe(res);
    if (!data) {
      return { configured: false, role: null };
    }
    if (res.ok && data.ok) {
      return {
        ...data,
        role: data.role ?? null
      };
    }
    if (data.configured) {
      return {
        configured: true,
        role: data.role ?? null,
        dbError: data.error || `Ошибка базы данных (${res.status})`
      };
    }
  } catch (err) {
    console.warn('Catalog bootstrap fallback to local mode:', err);
  }
  return { configured: false, role: null };
}

export async function sendAdminAction(action, payload) {
  const initData = tg?.initData || '';
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-init-data': initData
    },
    body: JSON.stringify({ action, payload, initData })
  });

  const data = await parseJsonSafe(res);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Ошибка сервера (${res.status})`);
  }
  return data;
}

export async function validatePromoCodeServer(code) {
  try {
    const res = await fetch('/api/promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await parseJsonSafe(res);
    if (!data) return { configured: false };
    return data;
  } catch {
    return { configured: false };
  }
}
