// Serverless Address & City Autocomplete / Validation Proxy (OpenStreetMap Nominatim)
// Supports mode=city and mode=address for Russia & CIS (CDEK coverage)

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

function cleanQuery(raw, maxLen = 140) {
  return String(raw || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

function formatCityItem(item) {
  const addr = item?.address || {};
  const name =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.hamlet ||
    item?.name ||
    '';
  if (!name) return null;
  const region = addr.state || addr.region || addr.county || '';
  const subtitle = region && region.toLowerCase() !== name.toLowerCase() ? region : (addr.country || '');
  return {
    value: name,
    label: subtitle ? `${name}, ${subtitle}` : name,
    region: subtitle
  };
}

function formatAddressItem(item, expectedCity = '') {
  const addr = item?.address || {};
  const road =
    addr.road ||
    addr.pedestrian ||
    addr.footway ||
    addr.residential ||
    addr.square ||
    addr.suburb ||
    '';
  const house = addr.house_number || '';
  const itemCity =
    addr.city || addr.town || addr.village || addr.municipality || addr.state || '';

  if (!road && !house) return null;

  const shortValue = [road, house].filter(Boolean).join(', ');
  const subtitleParts = [
    itemCity || expectedCity,
    addr.postcode
  ].filter(Boolean);

  return {
    value: shortValue,
    label: subtitleParts.length ? `${shortValue} · ${subtitleParts.join(', ')}` : shortValue,
    city: itemCity || expectedCity,
    hasHouse: Boolean(house),
    hasStreet: Boolean(road)
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const mode = req.query?.mode === 'city' ? 'city' : 'address';
  const q = cleanQuery(req.query?.q, 140);
  const city = cleanQuery(req.query?.city, 80);

  if (q.length < 2) {
    return res.status(200).json({ ok: true, suggestions: [] });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      addressdetails: '1',
      countrycodes: 'ru,by,kz',
      'accept-language': 'ru',
      limit: '6'
    });

    if (mode === 'city') {
      params.set('city', q);
    } else {
      params.set('q', city ? `${q}, ${city}` : q);
    }

    const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'SCREDTRES-Store/1.0 (https://scredtres.vercel.app)',
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(4500)
    });

    if (!response.ok) {
      return res.status(200).json({ ok: false, serviceUnavailable: true, suggestions: [] });
    }

    const raw = await response.json();
    const list = Array.isArray(raw) ? raw : [];

    const seen = new Set();
    const suggestions = [];
    for (const item of list) {
      const formatted = mode === 'city' ? formatCityItem(item) : formatAddressItem(item, city);
      if (!formatted || !formatted.value) continue;
      const key = formatted.value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push(formatted);
      if (suggestions.length >= 5) break;
    }

    return res.status(200).json({ ok: true, suggestions });
  } catch {
    return res.status(200).json({ ok: false, serviceUnavailable: true, suggestions: [] });
  }
}
