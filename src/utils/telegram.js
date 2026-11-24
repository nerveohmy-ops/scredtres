// Telegram WebApp SDK Helper
import { isLocalDevEnvironment, OWNER_USERNAME, ROLES } from './roles';

export const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;

export const initTelegramApp = () => {
  if (!tg) return;

  try {
    tg.ready();
    tg.expand();

    if (tg.setHeaderColor) tg.setHeaderColor('#000000');
    if (tg.setBackgroundColor) tg.setBackgroundColor('#000000');
  } catch (err) {
    console.warn('Telegram WebApp init warning:', err);
  }
};

export const setClosingConfirmation = (enabled) => {
  if (!tg) return;
  try {
    if (enabled && tg.enableClosingConfirmation) {
      tg.enableClosingConfirmation();
    } else if (!enabled && tg.disableClosingConfirmation) {
      tg.disableClosingConfirmation();
    }
  } catch {}
};

export const setBackButton = (visible, onClick) => {
  if (!tg?.BackButton) return;
  try {
    tg.BackButton.offClick(onClick);
    if (visible) {
      tg.BackButton.show();
      tg.BackButton.onClick(onClick);
    } else {
      tg.BackButton.hide();
    }
  } catch {}
};

export const haptic = {
  light: () => {
    try {
      tg?.HapticFeedback?.impactOccurred('light');
    } catch {}
  },
  medium: () => {
    try {
      tg?.HapticFeedback?.impactOccurred('medium');
    } catch {}
  },
  heavy: () => {
    try {
      tg?.HapticFeedback?.impactOccurred('heavy');
    } catch {}
  },
  success: () => {
    try {
      tg?.HapticFeedback?.notificationOccurred('success');
    } catch {}
  },
  error: () => {
    try {
      tg?.HapticFeedback?.notificationOccurred('error');
    } catch {}
  },
  select: () => {
    try {
      tg?.HapticFeedback?.selectionChanged();
    } catch {}
  }
};

export const getTelegramUser = (devRoleOverride = null) => {
  if (tg?.initDataUnsafe?.user) {
    return tg.initDataUnsafe.user;
  }

  if (isLocalDevEnvironment() && devRoleOverride) {
    if (devRoleOverride === ROLES.ADMIN) {
      return {
        id: 100001,
        first_name: 'Владелец',
        last_name: '',
        username: OWNER_USERNAME,
        language_code: 'ru'
      };
    }
    if (devRoleOverride === ROLES.SUPPORT) {
      return {
        id: 100002,
        first_name: 'Поддержка',
        last_name: 'приложения',
        username: '',
        language_code: 'ru'
      };
    }
  }

  return {
    id: 0,
    first_name: 'Гость',
    last_name: '',
    username: '',
    language_code: 'ru'
  };
};

export const openTelegramLink = (url) => {
  try {
    if (tg?.openTelegramLink && url.startsWith('https://t.me/')) {
      tg.openTelegramLink(url);
      return;
    }
    if (tg?.openLink && /^https?:\/\//i.test(url)) {
      tg.openLink(url);
      return;
    }
  } catch {}
  window.open(url, '_blank', 'noopener,noreferrer');
};

export const openExternalLink = openTelegramLink;

export const submitOrderToServer = async (orderData) => {
  const initData = tg?.initData || '';
  try {
    const response = await fetch('/api/order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-init-data': initData
      },
      body: JSON.stringify({
        orderData,
        initData
      })
    });
    const ct = response.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await response.json().catch(() => null) : null;
    if (response.ok && data) {
      return data;
    }
    if (!response.ok && data?.error) {
      return { ok: false, configured: true, error: data.error };
    }
  } catch (err) {
    console.warn('Order API dispatch skipped or unavailable locally:', err);
  }
  return { ok: false, localOnly: true };
};
