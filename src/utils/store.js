// Persistent client store helpers & image compression for SCREDTRES

const STORAGE_KEYS = {
  PRODUCTS: 'scredtres_products_v2',
  INFO_ITEMS: 'scredtres_info_items_v2',
  ORDERS: 'scredtres_orders_v2',
  PROMOS: 'scredtres_promos_v2',
  SETTINGS: 'scredtres_settings_v3',
  CART: 'scredtres_cart_v2',
  FAVORITES: 'scredtres_favorites_v2'
};

export const DEFAULT_SETTINGS = {
  freeShippingThreshold: 15000,
  standardShippingCost: 490,
  supportUsername: 'dybriansik',
  ownerUsername: 'dybriansik',
  chinaDeliveryNote: 'Одежда и обувь в наличии и под заказ из Китая'
};

export const loadJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

export const saveJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`Storage save failed for ${key}:`, err);
    return false;
  }
};

export const store = {
  getProducts: () => loadJson(STORAGE_KEYS.PRODUCTS, []),
  saveProducts: (list) => saveJson(STORAGE_KEYS.PRODUCTS, list),
  clearProducts: () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.PRODUCTS);
    } catch {}
  },

  getInfoItems: () => loadJson(STORAGE_KEYS.INFO_ITEMS, []),
  saveInfoItems: (list) => saveJson(STORAGE_KEYS.INFO_ITEMS, list),

  getOrders: () => loadJson(STORAGE_KEYS.ORDERS, []),
  saveOrders: (list) => saveJson(STORAGE_KEYS.ORDERS, list),

  getPromos: () => loadJson(STORAGE_KEYS.PROMOS, []),
  savePromos: (list) => saveJson(STORAGE_KEYS.PROMOS, list),

  getSettings: () => ({ ...DEFAULT_SETTINGS, ...loadJson(STORAGE_KEYS.SETTINGS, {}) }),
  saveSettings: (settings) => saveJson(STORAGE_KEYS.SETTINGS, settings),

  getCart: () => loadJson(STORAGE_KEYS.CART, []),
  saveCart: (cart) => saveJson(STORAGE_KEYS.CART, cart),

  getFavorites: () => loadJson(STORAGE_KEYS.FAVORITES, []),
  saveFavorites: (favs) => saveJson(STORAGE_KEYS.FAVORITES, favs)
};

export const formatPrice = (val) => {
  return new Intl.NumberFormat('ru-RU').format(Number(val) || 0) + ' ₽';
};

export const PHONE_MAX_LENGTH = 18; // "+7 (999) 000-00-00"

export const getRuPhoneDigits = (raw) => {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('7') || digits.startsWith('8')) {
    digits = digits.slice(1);
  }
  // Handle pasting a full 11-digit number (7.../8...) right into "+7 "
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
};

export const formatRuPhone = (subscriberDigits) => {
  const d = String(subscriberDigits || '').slice(0, 10);
  if (!d) return '+7 ';
  let out = `+7 (${d.slice(0, 3)}`;
  if (d.length >= 3) out += ')';
  if (d.length > 3) out += ` ${d.slice(3, 6)}`;
  if (d.length > 6) out += `-${d.slice(6, 8)}`;
  if (d.length > 8) out += `-${d.slice(8, 10)}`;
  return out;
};

export const reconcileCartWithProducts = (cartItems, serverProducts) => {
  if (!Array.isArray(cartItems) || !Array.isArray(serverProducts)) {
    return { nextCart: Array.isArray(cartItems) ? cartItems : [], removedNames: [], priceUpdated: false };
  }
  const byId = new Map(serverProducts.map((p) => [p.id, p]));
  const nextCart = [];
  const removedNames = [];
  let priceUpdated = false;

  for (const item of cartItems) {
    const id = item?.product?.id;
    if (!id) continue;
    const fresh = byId.get(id);
    if (!fresh) {
      if (item.product?.name) removedNames.push(item.product.name);
      continue;
    }
    if (Number(fresh.price) !== Number(item.product?.price)) {
      priceUpdated = true;
    }
    nextCart.push({
      ...item,
      product: fresh
    });
  }

  return { nextCart, removedNames, priceUpdated };
};

// Compresses uploaded photos cleanly so local storage doesn't overflow
export const compressImageFile = (file, maxDimension = 900, quality = 0.78) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
