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

export const DEFAULT_DELIVERY_DAYS = '7-15 дней';

export const DELIVERY_METHODS = [
  { id: 'cdek_pvz', label: 'СДЭК ПВЗ', description: 'По РФ и СНГ' },
  { id: 'pickup_blg', label: 'Благовещенск', description: 'Забрать лично · без данных' }
];

export const PAYMENT_METHODS = [
  { id: 'sbp_card', label: 'СБП / Карта РФ' },
  { id: 'crypto', label: 'USDT (TRC-20)' },
  { id: 'manager', label: 'Через менеджера' }
];

export const getDeliveryMethodLabel = (method) => {
  switch (method) {
    case 'cdek_pvz':
      return 'СДЭК ПВЗ';
    case 'pickup_blg':
      return 'Благовещенск (забрать лично)';
    case 'cdek_courier':
      return 'Курьер';
    case 'post_ru':
      return 'Почта';
    default:
      return 'СДЭК ПВЗ';
  }
};

export const getPaymentMethodLabel = (method) => {
  switch (method) {
    case 'sbp_card':
      return 'СБП / Карта РФ';
    case 'crypto':
      return 'USDT (TRC-20)';
    case 'manager':
      return 'Через менеджера';
    case 'stars':
      return 'Telegram Stars';
    default:
      return 'СБП / Карта РФ';
  }
};

import { SEED_PRODUCTS } from './seedProducts';

export const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'ONE SIZE'];

// Позиции «под заказ из Китая» из @scredtres (начиная с поста #882), автозагружаются в Turso при первом запуске
export const PRODUCTS = SEED_PRODUCTS;
