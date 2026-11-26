// Live public reviews fetcher from https://t.me/s/reviewscred (progressive fallback)
import { sanitizeImageUrl } from '../lib/turso.js';

const CHANNEL_HTML_URL = 'https://t.me/s/reviewscred';

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

function stripTagsAndKeepNewlines(html) {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  ).trim();
}

export function parseTelegramChannelHtml(html) {
  if (!html || typeof html !== 'string') return [];

  const blocks = html.split('<div class="tgme_widget_message_wrap');
  const parsedPosts = [];

  for (const block of blocks) {
    const postMatch = block.match(/data-post="reviewscred\/(\d+)"/);
    if (!postMatch) continue;
    const postId = Number(postMatch[1]);
    if (!Number.isSafeInteger(postId) || postId <= 0) continue;

    const dateMatch = block.match(/datetime="([^"]+)"/);
    const date = dateMatch ? dateMatch[1] : '';

    const fwdMatch = block.match(
      /tgme_widget_message_forwarded_from_name"[^>]*>([\s\S]*?)<\/(?:a|span)>/
    );
    const author = fwdMatch ? stripTagsAndKeepNewlines(fwdMatch[1]) || 'Покупатель' : 'Покупатель';

    const textMatch = block.match(
      /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/
    );
    const text = textMatch ? stripTagsAndKeepNewlines(textMatch[1]) : '';

    const images = [];
    const photoRegex = /tgme_widget_message_photo_wrap[^"]*"[^>]*background-image:url\('([^']+)'\)/g;
    let m;
    while ((m = photoRegex.exec(block)) !== null) {
      const clean = sanitizeImageUrl(decodeHtmlEntities(m[1]));
      if (clean && !images.includes(clean)) images.push(clean);
    }

    const roundVideoMatch = block.match(
      /tgme_widget_message_roundvideo_thumb[^"]*"[^>]*background-image:url\('([^']+)'\)/
    );
    const isVideoNote = block.includes('tgme_widget_message_roundvideo_player');
    if (roundVideoMatch) {
      const clean = sanitizeImageUrl(decodeHtmlEntities(roundVideoMatch[1]));
      if (clean && !images.includes(clean)) images.push(clean);
    }

    const durationMatch = block.match(
      /tgme_widget_message_roundvideo_duration"[^>]*>([^<]+)<\/time>/
    );
    const videoDuration = durationMatch ? durationMatch[1].trim() : '';

    if (!text && images.length === 0) continue;

    parsedPosts.push({
      id: `rev-${postId}`,
      author,
      date,
      text,
      messages: text ? [text] : [],
      images,
      postId,
      postIds: [postId],
      postUrl: `https://t.me/reviewscred/${postId}`,
      isVideoNote: Boolean(isVideoNote),
      ...(videoDuration ? { videoDuration } : {})
    });
  }

  // Group multi-message posts from the same author posted within 10 minutes
  const grouped = [];
  for (const post of parsedPosts) {
    const prev = grouped[grouped.length - 1];
    const prevTime = prev?.date ? Date.parse(prev.date) : NaN;
    const currTime = post?.date ? Date.parse(post.date) : NaN;
    const closeInTime =
      Number.isFinite(prevTime) &&
      Number.isFinite(currTime) &&
      Math.abs(currTime - prevTime) <= 10 * 60 * 1000;

    if (
      prev &&
      post.author !== 'Покупатель' &&
      prev.author.toLowerCase() === post.author.toLowerCase() &&
      closeInTime
    ) {
      if (post.text && !prev.messages.includes(post.text)) {
        prev.messages.push(post.text);
        prev.text = prev.messages.join('\n\n');
      }
      for (const img of post.images) {
        if (!prev.images.includes(img)) prev.images.push(img);
      }
      prev.postIds.push(post.postId);
      if (post.isVideoNote) prev.isVideoNote = true;
    } else {
      grouped.push(post);
    }
  }

  return grouped.sort((a, b) => b.postId - a.postId);
}

function extractBeforeCursor(html) {
  const m = String(html || '').match(/data-before="(\d+)"/);
  return m ? Number(m[1]) : null;
}

function mergeReviewsByPostId(pages) {
  const byId = new Map();
  for (const list of pages) {
    for (const item of list) {
      if (!byId.has(item.postId)) {
        byId.set(item.postId, item);
      }
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.postId - a.postId);
}

async function fetchChannelPage(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; SCREDTRESBot/1.0)',
      Accept: 'text/html'
    },
    signal: AbortSignal.timeout(5500)
  });
  if (!response.ok) return null;
  return response.text();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=180, stale-while-revalidate=600');

  try {
    const pages = [];
    let nextUrl = CHANNEL_HTML_URL;
    const seenCursors = new Set();
    const MAX_PAGES = 4;

    for (let page = 0; page < MAX_PAGES && nextUrl; page++) {
      const html = await fetchChannelPage(nextUrl);
      if (!html) break;
      const parsed = parseTelegramChannelHtml(html);
      if (parsed.length > 0) {
        pages.push(parsed);
      }
      const beforeId = extractBeforeCursor(html);
      if (!beforeId || seenCursors.has(beforeId)) break;
      seenCursors.add(beforeId);
      nextUrl = `${CHANNEL_HTML_URL}?before=${beforeId}`;
    }

    const reviews = mergeReviewsByPostId(pages);
    return res.status(200).json({ ok: true, reviews });
  } catch {
    return res.status(200).json({ ok: false, reviews: [] });
  }
}
