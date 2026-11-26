// Vercel Serverless Function - Telegram Webhook Handler
// Runs 24/7 on Vercel without requiring a local machine
import crypto from 'node:crypto';
import { getBotToken } from '../lib/auth.js';

export const escapeHtml = (value) =>
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

function timingSafeSecretMatch(provided, expected) {
  if (typeof provided !== 'string' || !provided || !expected) return false;
  const a = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('SCREDTRES Webhook is active');
  }

  const WEBHOOK_SECRET = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (!WEBHOOK_SECRET) {
    return res.status(500).json({ ok: false, error: 'TELEGRAM_WEBHOOK_SECRET is not configured' });
  }

  const providedSecret = getHeader(req.headers, 'x-telegram-bot-api-secret-token');
  if (!timingSafeSecretMatch(typeof providedSecret === 'string' ? providedSecret.trim() : '', WEBHOOK_SECRET)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized webhook request' });
  }

  const TOKEN = getBotToken();
  if (!TOKEN) {
    return res.status(500).json({ ok: false, error: 'BOT_TOKEN is not configured' });
  }

  const WEBAPP_URL = 'https://scredtres.vercel.app/';
  const API_BASE = `https://api.telegram.org/bot${TOKEN}`;

  const update = req.body;
  if (!update || !update.message) {
    return res.status(200).json({ ok: true });
  }

  const msg = update.message;
  const chatId = msg.chat?.id;
  const username = (msg.from?.username || '').toLowerCase();

  try {
    // 1. When user sends /start
    if (msg.text && msg.text.startsWith('/start')) {
      let roleLine = '';
      if (username === 'dybriansik') {
        roleLine = '\n\n👑 Вы вошли как владелец (@dybriansik) — панель управления открыта внутри магазина.';
      }

      const welcomeText =
        '<b>SCREDTRES</b>\n\n' +
        'Магазин одежды и обуви в наличии и под заказ из Китая.\n\n' +
        '• Позиции в наличии и под заказ\n' +
        '• По вопросам и заказам: @dybriansik' +
        roleLine +
        '\n\nНажмите кнопку ниже, чтобы открыть каталог:';

      await fetch(`${API_BASE}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: welcomeText,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🖤 Открыть магазин SCREDTRES',
                  web_app: { url: WEBAPP_URL }
                }
              ]
            ]
          }
        })
      });
    }

    // 2. Fallback for legacy web_app_data submissions (if launched via KeyboardButton)
    if (msg.web_app_data?.data) {
      const orderData = JSON.parse(msg.web_app_data.data);
      const safeOrderId = escapeHtml(orderData?.orderId || '');
      const safeTotal = escapeHtml(Number(orderData?.pricing?.total) || 0);
      const safeCity = escapeHtml(orderData?.delivery?.city || '');
      const safeAddress = escapeHtml(orderData?.delivery?.address || '');
      const safeComment = escapeHtml(String(orderData?.comment || '').trim());

      await fetch(`${API_BASE}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text:
            `<b>ЗАКАЗ ПРИНЯТ: ${safeOrderId}</b>\n\n` +
            `Сумма: ${safeTotal} ₽\n` +
            `Доставка: СДЭК ПВЗ — ${safeCity}, ${safeAddress}` +
            (safeComment ? `\nКомментарий: ${safeComment}` : '') +
            `\n\nСвязь с владельцем: @dybriansik`,
          parse_mode: 'HTML'
        })
      });
    }
  } catch (err) {
    console.error('Error handling webhook:', err);
  }

  return res.status(200).json({ ok: true });
}
