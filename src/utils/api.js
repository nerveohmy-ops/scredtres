// Frontend API client for Turso-backed Vercel endpoints (with clean local fallback)
import { getTg } from './telegram';

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
        'x-telegram-init-data': getTg()?.initData || ''
      },
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
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
    console.warn('Catalog bootstrap network/timeout error:', err);
    return { configured: false, role: null, networkError: true };
  }
  return { configured: false, role: null };
}

export async function sendAdminAction(action, payload) {
  const initData = getTg()?.initData || '';
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

export async function fetchLiveReviews(signal) {
  try {
    const res = await fetch('/api/reviews', {
      method: 'GET',
      signal
    });
    const data = await parseJsonSafe(res);
    if (res.ok && data?.ok && Array.isArray(data.reviews)) {
      return { ok: true, reviews: data.reviews };
    }
  } catch {}
  return { ok: false, reviews: [] };
}

export async function fetchAddressSuggestions({ mode = 'address', q = '', city = '', signal } = {}) {
  const cleanQ = String(q || '').trim();
  if (cleanQ.length < 2) return { ok: true, suggestions: [] };
  try {
    const params = new URLSearchParams({ mode, q: cleanQ });
    if (city) params.set('city', String(city).trim());
    const res = await fetch(`/api/address?${params.toString()}`, {
      method: 'GET',
      signal
    });
    const data = await parseJsonSafe(res);
    if (res.ok && data) {
      return {
        ok: Boolean(data.ok),
        serviceUnavailable: Boolean(data.serviceUnavailable),
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : []
      };
    }
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, aborted: true, suggestions: [] };
  }
  return { ok: false, serviceUnavailable: true, suggestions: [] };
}

export async function fetchCdekPvz({ city = '', lat, lon, signal } = {}) {
  try {
    const params = new URLSearchParams();
    if (city) params.set('city', String(city).trim());
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      params.set('lat', String(lat));
      params.set('lon', String(lon));
    }
    const res = await fetch(`/api/cdek-pvz?${params.toString()}`, {
      method: 'GET',
      signal
    });
    const data = await parseJsonSafe(res);
    if (res.ok && data) {
      return {
        ok: Boolean(data.ok),
        city: data.city || city,
        center: data.center || null,
        points: Array.isArray(data.points) ? data.points : [],
        source: data.source || 'osm'
      };
    }
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, aborted: true, points: [] };
  }
  return { ok: false, points: [] };
}

export async function reverseGeocodePvz(lat, lon) {
  try {
    const res = await fetch(
      `/api/cdek-pvz?mode=reverse&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
      { method: 'GET' }
    );
    const data = await parseJsonSafe(res);
    if (res.ok && data?.ok) return data;
  } catch {}
  return null;
}
