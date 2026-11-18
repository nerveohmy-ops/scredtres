// Telegram Bot Handler for SCREDTRES
// Native Node.js fetch (no heavy external dependencies required)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEBAPP_URL = process.env.WEBAPP_URL || 'https://scredtres.vercel.app';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTokenOrExit() {
  const token = (process.env.BOT_TOKEN || '').trim();
  if (!token) {
    console.error('Error: Set BOT_TOKEN environment variable before running bot.js');
    process.exit(1);
  }
  return token;
}

async function tgPost(method, data, token = (process.env.BOT_TOKEN || '').trim()) {
  if (!token) {
    throw new Error('BOT_TOKEN is not configured');
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  } catch (err) {
    console.error(`Error calling ${method}:`, err);
    return null;
  }
}

// Set up the menu button and description automatically
export async function setupBot(url = WEBAPP_URL, token = (process.env.BOT_TOKEN || '').trim()) {
  console.log(`Setting up bot with WebApp URL: ${url}`);

  // 1. Set Menu Button (Bottom-left button in chat)
  const menuRes = await tgPost(
    'setChatMenuButton',
    {
      menu_button: {
        type: 'web_app',
        text: '🖤 Магазин',
        web_app: { url }
      }
    },
    token
  );
  console.log('Menu Button Response:', menuRes);

  // 2. Set Bot Description (shown before /start)
  await tgPost(
    'setMyDescription',
    {
      description:
        'SCREDTRES — выкуп и доставка оригинальной одежды и обуви из Китая (Poizon / Dewu, Taobao, 1688). В наличии и под заказ.'
    },
    token
  );

  // 3. Set Bot Short Description
  await tgPost(
    'setMyShortDescription',
    {
      short_description: 'SCREDTRES — выкуп одежды и обуви из Китая.'
    },
    token
  );

  return menuRes;
}

// Register Telegram Webhook with secret_token
export async function setupWebhook(
  webhookUrl,
  secretToken = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim(),
  token = (process.env.BOT_TOKEN || '').trim()
) {
  if (!webhookUrl || typeof webhookUrl !== 'string') {
    throw new Error('Webhook URL is required');
  }
  if (!secretToken) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET is required to register webhook');
  }

  console.log(`Registering Telegram webhook: ${webhookUrl}`);
  const res = await tgPost(
    'setWebhook',
    {
      url: webhookUrl,
      secret_token: secretToken
    },
    token
  );
  console.log('setWebhook Response:', res);
  return res;
}

// Long polling to answer /start and receive web_app_data orders
let offset = 0;
async function pollUpdates(token) {
  const apiBase = `https://api.telegram.org/bot${token}`;
  while (true) {
    try {
      const res = await fetch(`${apiBase}/getUpdates?offset=${offset}&timeout=25`);
      const data = await res.json();

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          const msg = update.message;

          if (!msg) continue;
          const chatId = msg.chat.id;

          // When user sends /start
          if (msg.text && msg.text.startsWith('/start')) {
            await tgPost(
              'sendMessage',
              {
                chat_id: chatId,
                text: '<b>SCREDTRES</b>\n\nВыкуп и доставка оригинальной одежды и обуви из Китая (Poizon / Dewu, Taobao, 1688).\n\nНажмите кнопку ниже, чтобы открыть каталог:',
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
              },
              token
            );
          }

          // When user submits order from WebApp
          if (msg.web_app_data?.data) {
            try {
              const orderData = JSON.parse(msg.web_app_data.data);
              const safeOrderId = escapeHtml(orderData?.orderId || '');
              const safeTotal = escapeHtml(Number(orderData?.pricing?.total) || 0);
              const safeCity = escapeHtml(orderData?.delivery?.city || '');
              const safeAddress = escapeHtml(orderData?.delivery?.address || '');
              const safeComment = escapeHtml(String(orderData?.comment || '').trim());

              await tgPost(
                'sendMessage',
                {
                  chat_id: chatId,
                  text:
                    `<b>ЗАКАЗ ПРИНЯТ: ${safeOrderId}</b>\n\n` +
                    `Сумма: ${safeTotal} ₽\n` +
                    `Доставка: СДЭК ПВЗ — ${safeCity}, ${safeAddress}` +
                    (safeComment ? `\nКомментарий: ${safeComment}` : '') +
                    '\n\nМенеджер свяжется с вами для отправки трек-номера СДЭК.',
                  parse_mode: 'HTML'
                },
                token
              );
            } catch (e) {
              console.error('Error parsing order data:', e);
            }
          }
        }
      }
    } catch (err) {
      console.error('Polling error, retrying in 3s:', err);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    const selfPath = path.resolve(fileURLToPath(import.meta.url)).toLowerCase();
    const entryPath = path.resolve(process.argv[1]).toLowerCase();
    return selfPath === entryPath;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const token = getTokenOrExit();
  const args = process.argv.slice(2);
  const setupArg = args.indexOf('--setup');
  const webhookArg = args.indexOf('--webhook');

  if (webhookArg !== -1) {
    const webhookUrl = args[webhookArg + 1];
    const secretToken = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
    if (!webhookUrl || !webhookUrl.startsWith('https://')) {
      console.error('Error: Pass an https:// webhook URL after --webhook');
      process.exit(1);
    }
    if (!secretToken) {
      console.error('Error: Set TELEGRAM_WEBHOOK_SECRET environment variable before running --webhook');
      process.exit(1);
    }
    setupWebhook(webhookUrl, secretToken, token)
      .then((res) => {
        if (!res?.ok) process.exit(1);
        console.log('Webhook registered successfully.');
        process.exit(0);
      })
      .catch((err) => {
        console.error('Webhook setup failed:', err);
        process.exit(1);
      });
  } else if (setupArg !== -1 && args[setupArg + 1]) {
    const customUrl = args[setupArg + 1];
    setupBot(customUrl, token).then(() => {
      console.log('Bot configured successfully with URL:', customUrl);
      process.exit(0);
    });
  } else {
    setupBot(WEBAPP_URL, token).then(() => {
      console.log('Bot polling started...');
      pollUpdates(token);
    });
  }
}
