// Telegram WebApp SDK Helper
import { isLocalDevEnvironment, OWNER_USERNAME, ROLES } from './roles';

export const getTg = () => (typeof window !== 'undefined' ? window.Telegram?.WebApp || null : null);
export const tg = getTg();

export const initTelegramApp = () => {
  const webApp = getTg();
  if (!webApp) return;

  try {
    webApp.ready();
    webApp.expand();
    webApp.disableVerticalSwipes?.();

    webApp.setHeaderColor?.('#000000');
    webApp.setBackgroundColor?.('#000000');
    webApp.setBottomBarColor?.('#000000');
  } catch (err) {
    console.warn('Telegram WebApp init warning:', err);
  }
};

export const setClosingConfirmation = (enabled) => {
  const webApp = getTg();
  if (!webApp) return;
  try {
    if (enabled && webApp.enableClosingConfirmation) {
      webApp.enableClosingConfirmation();
    } else if (!enabled && webApp.disableClosingConfirmation) {
      webApp.disableClosingConfirmation();
    }
  } catch {}
};

const backHandlerStack = [];
let backListenerAttached = false;

const dispatchBackClick = () => {
  const top = backHandlerStack[backHandlerStack.length - 1];
  if (typeof top === 'function') {
    top();
  }
};

function syncNativeBackButton() {
  const webApp = getTg();
  const btn = webApp?.BackButton;
  if (!btn) return;
  try {
    if (backHandlerStack.length > 0) {
      if (!backListenerAttached) {
        btn.onClick(dispatchBackClick);
        backListenerAttached = true;
      }
      btn.show();
    } else {
      if (backListenerAttached) {
        btn.offClick(dispatchBackClick);
        backListenerAttached = false;
      }
      btn.hide();
    }
  } catch {}
}

export const registerBackHandler = (handler) => {
  if (typeof handler !== 'function') return () => {};
  backHandlerStack.push(handler);
  syncNativeBackButton();
  return () => {
    const idx = backHandlerStack.lastIndexOf(handler);
    if (idx !== -1) backHandlerStack.splice(idx, 1);
    syncNativeBackButton();
  };
};

export const setBackButton = (visible, onClick) => {
  const idx = backHandlerStack.lastIndexOf(onClick);
  if (idx !== -1) backHandlerStack.splice(idx, 1);
  if (visible && typeof onClick === 'function') {
    backHandlerStack.push(onClick);
  }
  syncNativeBackButton();
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

export const requestUserLocation = () =>
  new Promise((resolve) => {
    const fallbackBrowserGeo = () => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve({
          ok: false,
          error: 'Геолокация не поддерживается на этом устройстве. Введите город вручную.'
        });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            ok: true,
            lat: pos.coords.latitude,
            lon: pos.coords.longitude
          });
        },
        (err) => {
          if (err?.code === 1) {
            resolve({
              ok: false,
              denied: true,
              error: 'Доступ к геолокации запрещён. Разрешите его в настройках или введите город вручную.'
            });
          } else {
            resolve({
              ok: false,
              error: 'Не удалось определить геолокацию. Введите город в поиске выше.'
            });
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    };

    try {
      const lm = tg?.LocationManager;
      if (lm && typeof lm.init === 'function' && typeof lm.getLocation === 'function') {
        let settled = false;
        const done = (result) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };

        const runGetLocation = () => {
          if (lm.isLocationAvailable === false) {
            fallbackBrowserGeo();
            return;
          }
          lm.getLocation((loc) => {
            if (loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
              done({ ok: true, lat: loc.latitude, lon: loc.longitude });
            } else if (lm.isAccessRequested && lm.isAccessGranted === false) {
              done({
                ok: false,
                denied: true,
                canOpenSettings: typeof lm.openSettings === 'function',
                error: 'Доступ к геолокации отключён для этого мини-приложения в Telegram.'
              });
            } else {
              fallbackBrowserGeo();
            }
          });
        };

        if (lm.isInited) {
          runGetLocation();
        } else {
          lm.init(() => runGetLocation());
        }
        return;
      }
    } catch {}

    fallbackBrowserGeo();
  });

export const openTelegramLocationSettings = () => {
  try {
    tg?.LocationManager?.openSettings?.();
  } catch {}
};

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
