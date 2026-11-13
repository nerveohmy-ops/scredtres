// SCREDTRES Store Configuration & Catalog Schema
// Специализация: выкуп и доставка оригинальной одежды и обуви из Китая

export const CATEGORIES = [
  { id: 'all', name: 'Все' },
  { id: 'hoodies', name: 'Худи & Зип' },
  { id: 'tees', name: 'Футболки' },
  { id: 'pants', name: 'Штаны' },
  { id: 'outerwear', name: 'Куртки' },
  { id: 'footwear', name: 'Обувь' },
  { id: 'accessories', name: 'Аксессуары' }
];

export const AVAILABILITY_OPTIONS = [
  { id: 'all', name: 'Все' },
  { id: 'in_stock', name: 'В наличии' },
  { id: 'pre_order', name: 'Под заказ' }
];

export const ORDER_STATUSES = [
  { id: 'new', name: 'Новый заказ' },
  { id: 'buying_china', name: 'Выкупается в Китае' },
  { id: 'shipping_china', name: 'В пути из Китая' },
  { id: 'cdek_rf', name: 'Передан в СДЭК' },
  { id: 'completed', name: 'Выполнен' },
  { id: 'cancelled', name: 'Отменен' }
];

export const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'ONE SIZE'];

// Начальный каталог пуст — товары добавляются через панель владельца (@dybriansik) и поддержки приложения
export const PRODUCTS = [];
