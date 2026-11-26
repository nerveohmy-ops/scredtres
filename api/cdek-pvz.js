// Serverless CDEK PVZ (Pickup Point) Lookup API
// Uses official CDEK API v2 when CDEK_CLIENT_ID + CDEK_CLIENT_SECRET are configured,
// with automatic zero-config OpenStreetMap Nominatim fallback for Russia & CIS.

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const CDEK_AUTH_URL = 'https://api.cdek.ru/v2/oauth/token';
const CDEK_PVZ_URL = 'https://api.cdek.ru/v2/deliverypoints';
const USER_AGENT = 'SCREDTRES-Store/1.0 (https://scredtres.vercel.app)';

let cachedCdekToken = null;
let cachedCdekTokenExp = 0;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatOsmOpeningHours(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/Mo-Fr/g, 'Пн–Пт')
    .replace(/Mo-Su/g, 'Ежедневно')
    .replace(/Sa-Su/g, 'Сб–Вс')
    .replace(/Sa/g, 'Сб')
    .replace(/Su/g, 'Вс')
    .replace(/;/g, ', ')
    .trim();
}

function cleanStr(val, maxLen = 120) {
  return String(val || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

async function getCdekAccessToken() {
  const clientId = (process.env.CDEK_CLIENT_ID || '').trim();
  const clientSecret = (process.env.CDEK_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (cachedCdekToken && now < cachedCdekTokenExp - 30_000) {
    return cachedCdekToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret
  });

  const res = await fetch(CDEK_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.access_token) return null;

  cachedCdekToken = data.access_token;
  cachedCdekTokenExp = now + (Number(data.expires_in) || 3600) * 1000;
  return cachedCdekToken;
}

async function fetchOfficialCdekPoints({ city, lat, lon }) {
  const token = await getCdekAccessToken();
  if (!token) return null;

  const params = new URLSearchParams({ type: 'PVZ', country_code: 'RU', lang: 'rus' });
  if (city) params.set('city', city);

  const res = await fetch(`${CDEK_PVZ_URL}?${params.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(6500)
  });
  if (!res.ok) return null;
  const list = await res.json();
  if (!Array.isArray(list)) return null;

  const points = [];
  for (const item of list) {
    const loc = item?.location;
    const pLat = Number(loc?.latitude);
    const pLon = Number(loc?.longitude);
    if (!Number.isFinite(pLat) || !Number.isFinite(pLon)) continue;

    const pCity = cleanStr(loc?.city || city, 80);
    const shortAddr = cleanStr(loc?.address || loc?.address_full || '', 200);
    if (!shortAddr) continue;

    points.push({
      id: `cdek-${item.code}`,
      code: cleanStr(item.code, 32),
      name: cleanStr(item.name || `ПВЗ СДЭК ${item.code}`, 120),
      city: pCity,
      address: shortAddr,
      workTime: cleanStr(item.work_time || '', 120),
      lat: pLat,
      lon: pLon,
      hasHouse: /\d/.test(shortAddr),
      distance:
        Number.isFinite(lat) && Number.isFinite(lon)
          ? haversineMeters(lat, lon, pLat, pLon)
          : null,
      source: 'cdek'
    });
  }

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    points.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  }
  return points.slice(0, 60);
}

async function reverseGeocode(lat, lon) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lon),
    addressdetails: '1',
    'accept-language': 'ru'
  });
  const res = await fetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(4500)
  });
  if (!res.ok) return null;
  const data = await res.json();
  const addr = data?.address || {};
  const city =
    addr.city || addr.town || addr.village || addr.municipality || addr.state || '';
  const road =
    addr.road || addr.pedestrian || addr.residential || addr.suburb || '';
  const house = addr.house_number || '';
  const address = [road, house].filter(Boolean).join(', ');
  return {
    city: cleanStr(city, 80),
    address: cleanStr(address, 200),
    hasHouse: Boolean(house)
  };
}

async function geocodeCityCenter(city) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    city,
    countrycodes: 'ru,by,kz',
    'accept-language': 'ru',
    limit: '1'
  });
  const res = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(4500)
  });
  if (!res.ok) return null;
  const data = await res.json();
  const first = Array.isArray(data) ? data[0] : null;
  if (!first) return null;
  const lat = Number(first.lat);
  const lon = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function parseOsmPvzItem(item, fallbackCity, refLat, refLon) {
  const pLat = Number(item?.lat);
  const pLon = Number(item?.lon);
  if (!Number.isFinite(pLat) || !Number.isFinite(pLon)) return null;

  const rawName = String(item?.name || '');
  const displayName = String(item?.display_name || '');
  if (!/сдэк|cdek/i.test(rawName) && !/сдэк|cdek/i.test(displayName)) {
    return null;
  }

  const addr = item?.address || {};
  const city = cleanStr(
    addr.city || addr.town || addr.village || addr.municipality || addr.state || fallbackCity,
    80
  );
  const road =
    addr.road || addr.pedestrian || addr.residential || addr.square || addr.suburb || '';
  const house = addr.house_number || '';

  let shortAddr = [road, house].filter(Boolean).join(', ');
  if (!shortAddr && displayName) {
    // Extract compact address from Nominatim display_name after "СДЭК,"
    const parts = displayName
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p && !/сдэк|cdek/i.test(p));
    shortAddr = parts.slice(0, 2).join(', ');
  }

  const extra = item?.extratags || {};
  const workTime = formatOsmOpeningHours(extra.opening_hours || '');

  return {
    id: `osm-${item.osm_id || `${pLat.toFixed(5)}-${pLon.toFixed(5)}`}`,
    code: cleanStr(extra.ref || '', 32),
    name: cleanStr(rawName || 'ПВЗ СДЭК', 100),
    city,
    address: cleanStr(shortAddr || 'ПВЗ СДЭК', 200),
    workTime: cleanStr(workTime, 120),
    lat: pLat,
    lon: pLon,
    hasHouse: Boolean(house) || /\d/.test(shortAddr),
    distance:
      Number.isFinite(refLat) && Number.isFinite(refLon)
        ? haversineMeters(refLat, refLon, pLat, pLon)
        : null,
    source: 'osm'
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');

  const mode = cleanStr(req.query?.mode || 'search', 20);
  const lat = req.query?.lat !== undefined ? Number(req.query.lat) : NaN;
  const lon = req.query?.lon !== undefined ? Number(req.query.lon) : NaN;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);
  let city = cleanStr(req.query?.city || '', 80);

  try {
    // Reverse geocode a specific coordinate (used to resolve exact street/house or user city)
    if (mode === 'reverse' && hasCoords) {
      const info = await reverseGeocode(lat, lon);
      return res.status(200).json({ ok: Boolean(info), ...(info || {}) });
    }

    let center = hasCoords ? { lat, lon } : null;

    if (hasCoords && !city) {
      const rev = await reverseGeocode(lat, lon).catch(() => null);
      if (rev?.city) city = rev.city;
    }

    // 1. Try official CDEK API v2 first if credentials are configured
    const officialPoints = await fetchOfficialCdekPoints({
      city,
      lat: hasCoords ? lat : NaN,
      lon: hasCoords ? lon : NaN
    }).catch(() => null);

    if (officialPoints && officialPoints.length > 0) {
      if (!center) {
        center = { lat: officialPoints[0].lat, lon: officialPoints[0].lon };
      }
      return res.status(200).json({
        ok: true,
        source: 'cdek',
        city,
        center,
        points: officialPoints
      });
    }

    // 2. Fallback to OpenStreetMap Nominatim (bounded viewbox around coords or city search)
    const params = new URLSearchParams({
      format: 'jsonv2',
      addressdetails: '1',
      extratags: '1',
      countrycodes: 'ru,by,kz',
      'accept-language': 'ru',
      limit: '40'
    });

    if (hasCoords) {
      const dLat = 0.08;
      const dLon = 0.13;
      const viewbox = `${(lon - dLon).toFixed(5)},${(lat + dLat).toFixed(5)},${(lon + dLon).toFixed(5)},${(lat - dLat).toFixed(5)}`;
      params.set('q', 'СДЭК');
      params.set('viewbox', viewbox);
      params.set('bounded', '1');
    } else if (city) {
      params.set('q', `СДЭК ${city}`);
    } else {
      params.set('q', 'СДЭК Москва');
      city = 'Москва';
    }

    const searchPromise = fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(6500)
    });

    const centerPromise = !center && city ? geocodeCityCenter(city).catch(() => null) : Promise.resolve(center);

    const [searchRes, resolvedCenter] = await Promise.all([searchPromise, centerPromise]);
    if (resolvedCenter) center = resolvedCenter;

    let rawList = [];
    if (searchRes.ok) {
      const parsed = await searchRes.json();
      rawList = Array.isArray(parsed) ? parsed : [];
    }

    // If bounded viewbox around GPS returned 0 points (e.g. suburb/small town), retry wider city query
    if (rawList.length === 0 && hasCoords && city) {
      const wideParams = new URLSearchParams({
        format: 'jsonv2',
        addressdetails: '1',
        extratags: '1',
        countrycodes: 'ru,by,kz',
        'accept-language': 'ru',
        limit: '30',
        q: `СДЭК ${city}`
      });
      const wideRes = await fetch(`${NOMINATIM_SEARCH_URL}?${wideParams.toString()}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(5500)
      }).catch(() => null);
      if (wideRes?.ok) {
        const wideData = await wideRes.json().catch(() => []);
        if (Array.isArray(wideData)) rawList = wideData;
      }
    }

    const refLat = hasCoords ? lat : center?.lat ?? NaN;
    const refLon = hasCoords ? lon : center?.lon ?? NaN;

    const seen = new Set();
    const points = [];
    for (const item of rawList) {
      const pvz = parseOsmPvzItem(item, city, refLat, refLon);
      if (!pvz) continue;
      const dedupeKey = `${pvz.lat.toFixed(4)}:${pvz.lon.toFixed(4)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      points.push(pvz);
    }

    if (Number.isFinite(refLat) && Number.isFinite(refLon)) {
      points.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    }

    if (!center && points.length > 0) {
      center = { lat: points[0].lat, lon: points[0].lon };
    }

    return res.status(200).json({
      ok: true,
      source: 'osm',
      city,
      center: center || { lat: 55.7558, lon: 37.6173 },
      points
    });
  } catch {
    return res.status(200).json({
      ok: false,
      serviceUnavailable: true,
      city,
      center: hasCoords ? { lat, lon } : { lat: 55.7558, lon: 37.6173 },
      points: []
    });
  }
}
