import React, { useState, useEffect } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  Package,
  FileText,
  ShoppingBag,
  Settings,
  X,
  Check,
  Download,
  ExternalLink,
  RefreshCw,
  Tag,
  Copy,
  Search
} from 'lucide-react';
import {
  CATEGORIES,
  ORDER_STATUSES,
  DEFAULT_SIZES,
  DEFAULT_DELIVERY_DAYS,
  getDeliveryMethodLabel,
  getPaymentMethodLabel
} from '../data/products';
import { compressImageFile, formatPrice } from '../utils/store';
import { ROLES, canManageSettings } from '../utils/roles';
import { haptic, openTelegramLink } from '../utils/telegram';

const EMPTY_PRODUCT_FORM = {
  id: null,
  name: '',
  brand: '',
  category: 'hoodies',
  availability: 'pre_order',
  deliveryDays: DEFAULT_DELIVERY_DAYS,
  price: '',
  oldPrice: '',
  sizes: ['S', 'M', 'L', 'XL'],
  customSizesInput: '',
  images: [],
  imageUrlInput: '',
  description: '',
  detailsText: ''
};

export default function AdminPanel({
  role,
  products,
  onSaveProduct,
  onDeleteProduct,
  infoItems,
  onSaveInfoItem,
  onDeleteInfoItem,
  orders,
  onUpdateOrder,
  onDeleteOrder,
  promos,
  onAddPromo,
  onDeletePromo,
  settings,
  onSaveSettings,
  onImportBackup,
  dbConfigured = false,
  dbError = '',
  isRefreshing = false,
  onRefreshCatalog,
  localUnsyncedCount = 0,
  isSyncingLocal = false,
  localSyncNotice = '',
  onDismissLocalSyncNotice,
  onSyncLocalToTurso,
  onOpenProduct
}) {
  const isOwner = canManageSettings(role);
  const [section, setSection] = useState('products');

  // Product editor state
  const [editingProduct, setEditingProduct] = useState(null);
  const [productError, setProductError] = useState('');
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);

  // Info / Support answer editor state
  const [editingInfo, setEditingInfo] = useState(null);
  const [infoTitle, setInfoTitle] = useState('');
  const [infoContent, setInfoContent] = useState('');

  // Promo editor state
  const [promoCode, setPromoCode] = useState('');
  const [promoPercent, setPromoPercent] = useState('10');
  const [promoError, setPromoError] = useState('');
  const [isSavingPromo, setIsSavingPromo] = useState(false);
  const [copiedPromoCode, setCopiedPromoCode] = useState('');

  // Settings local form
  const [freeShipInput, setFreeShipInput] = useState(String(settings.freeShippingThreshold ?? 15000));
  const [shipCostInput, setShipCostInput] = useState(String(settings.standardShippingCost ?? 490));
  const [supportUserInput, setSupportUserInput] = useState(settings.supportUsername || 'dybriansik');
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    setFreeShipInput(String(settings.freeShippingThreshold ?? 15000));
    setShipCostInput(String(settings.standardShippingCost ?? 490));
    setSupportUserInput(settings.supportUsername || 'dybriansik');
  }, [settings.freeShippingThreshold, settings.standardShippingCost, settings.supportUsername]);

  // Tracking input cache & order filters
  const [trackingDrafts, setTrackingDrafts] = useState({});
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [copiedTgId, setCopiedTgId] = useState('');
  const [savedTrackingId, setSavedTrackingId] = useState('');

  const openNewProductForm = () => {
    haptic.light();
    setProductError('');
    setEditingProduct({ ...EMPTY_PRODUCT_FORM });
  };

  const openEditProductForm = (p) => {
    haptic.light();
    setProductError('');
    const standardSet = new Set(DEFAULT_SIZES);
    const customSizes = (p.sizes || []).filter((s) => !standardSet.has(s));
    const selectedDefaults = (p.sizes || []).filter((s) => standardSet.has(s));

    setEditingProduct({
      id: p.id,
      name: p.name || '',
      brand: p.brand || '',
      category: p.category || 'hoodies',
      availability: p.availability || 'pre_order',
      deliveryDays: p.deliveryDays || (p.availability === 'in_stock' ? '1–3 дня' : DEFAULT_DELIVERY_DAYS),
      price: String(p.price || ''),
      oldPrice: p.oldPrice ? String(p.oldPrice) : '',
      sizes: selectedDefaults,
      customSizesInput: customSizes.join(', '),
      images: p.images || [],
      imageUrlInput: '',
      description: p.description || '',
      detailsText: (p.details || []).join('\n')
    });
  };

  const handleToggleSize = (size) => {
    haptic.select();
    setEditingProduct((prev) => {
      const exists = prev.sizes.includes(size);
      return {
        ...prev,
        sizes: exists ? prev.sizes.filter((s) => s !== size) : [...prev.sizes, size]
      };
    });
  };

  const handleAvailabilityChange = (val) => {
    haptic.select();
    setEditingProduct((prev) => {
      const autoDays = val === 'in_stock' ? '1–3 дня' : DEFAULT_DELIVERY_DAYS;
      const shouldUpdateDays =
        !prev.deliveryDays ||
        prev.deliveryDays === '1–3 дня' ||
        prev.deliveryDays === DEFAULT_DELIVERY_DAYS ||
        prev.deliveryDays === '14–21 день';
      return {
        ...prev,
        availability: val,
        deliveryDays: shouldUpdateDays ? autoDays : prev.deliveryDays
      };
    });
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsCompressing(true);
    try {
      const compressed = await Promise.all(files.map((f) => compressImageFile(f)));
      setEditingProduct((prev) => ({
        ...prev,
        images: [...prev.images, ...compressed]
      }));
      haptic.success();
    } catch {
      setProductError('Не удалось обработать фото. Попробуйте другое изображение.');
      haptic.error();
    } finally {
      setIsCompressing(false);
      e.target.value = '';
    }
  };

  const handleAddImageUrl = () => {
    const url = editingProduct.imageUrlInput.trim();
    if (!url) return;
    haptic.light();
    setEditingProduct((prev) => ({
      ...prev,
      images: [...prev.images, url],
      imageUrlInput: ''
    }));
  };

  const handleRemoveImage = (index) => {
    haptic.light();
    setEditingProduct((prev) => ({
      ...prev,
      images: prev.images.filter((_, idx) => idx !== index)
    }));
  };

  const handleSubmitProduct = async (e) => {
    e.preventDefault();
    setProductError('');

    const cleanName = editingProduct.name.trim();
    const numericPrice = Number(editingProduct.price);
    const numericOldPrice = editingProduct.oldPrice ? Number(editingProduct.oldPrice) : null;

    if (!cleanName) {
      setProductError('Введите название товара.');
      haptic.error();
      return;
    }

    if (!numericPrice || numericPrice <= 0) {
      setProductError('Укажите корректную цену в рублях.');
      haptic.error();
      return;
    }

    const customSizes = editingProduct.customSizesInput
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const combinedSizes = [...new Set([...editingProduct.sizes, ...customSizes])];
    const finalSizes = combinedSizes.length > 0 ? combinedSizes : ['ONE SIZE'];

    const detailsList = editingProduct.detailsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const savedProduct = {
      id: editingProduct.id || `scred-${Date.now()}`,
      name: cleanName,
      brand: editingProduct.brand.trim(),
      category: editingProduct.category,
      availability: editingProduct.availability,
      deliveryDays: editingProduct.deliveryDays.trim(),
      price: numericPrice,
      oldPrice: numericOldPrice && numericOldPrice > numericPrice ? numericOldPrice : null,
      sizes: finalSizes,
      images: editingProduct.images,
      description: editingProduct.description.trim(),
      details: detailsList,
      createdAt: editingProduct.createdAt || new Date().toISOString()
    };

    setIsSavingProduct(true);
    const res = await onSaveProduct(savedProduct);
    setIsSavingProduct(false);

    if (res && res.ok === false) {
      setProductError(res.error || 'Не удалось сохранить товар в базу данных.');
      return;
    }

    setEditingProduct(null);
    haptic.success();
  };

  // Info Item handlers
  const handleStartNewInfo = () => {
    haptic.light();
    setEditingInfo({ id: null });
    setInfoTitle('');
    setInfoContent('');
  };

  const handleStartEditInfo = (item) => {
    haptic.light();
    setEditingInfo(item);
    setInfoTitle(item.title);
    setInfoContent(item.content);
  };

  const handleSaveInfoSubmit = (e) => {
    e.preventDefault();
    if (!infoTitle.trim() || !infoContent.trim()) return;
    haptic.success();
    onSaveInfoItem({
      id: editingInfo?.id || `info-${Date.now()}`,
      title: infoTitle.trim(),
      content: infoContent.trim(),
      updatedAt: new Date().toISOString()
    });
    setEditingInfo(null);
    setInfoTitle('');
    setInfoContent('');
  };

  // Promo handler
  const handlePromoSubmit = async (e) => {
    e.preventDefault();
    if (!isOwner) return;
    setPromoError('');

    const cleanCode = promoCode.trim().toUpperCase();
    const pct = Math.min(90, Math.max(1, Math.round(Number(promoPercent) || 10)));
    if (!/^[A-Z0-9_-]{2,32}$/.test(cleanCode)) {
      setPromoError('Код: от 2 до 32 символов (латиница A-Z, цифры, _ или -).');
      haptic.error();
      return;
    }

    setIsSavingPromo(true);
    const res = await onAddPromo({
      code: cleanCode,
      discountPercent: pct,
      createdAt: new Date().toISOString()
    });
    setIsSavingPromo(false);

    if (res && res.ok === false) {
      setPromoError(res.error || 'Не удалось сохранить промокод.');
      haptic.error();
      return;
    }

    haptic.success();
    setPromoCode('');
    setPromoPercent('10');
  };

  const handleCopyPromo = async (code) => {
    haptic.light();
    try {
      await navigator.clipboard?.writeText(code);
      setCopiedPromoCode(code);
      setTimeout(() => {
        setCopiedPromoCode((curr) => (curr === code ? '' : curr));
      }, 1500);
    } catch {}
  };

  // Settings handler
  const handleSettingsSubmit = (e) => {
    e.preventDefault();
    haptic.success();
    onSaveSettings({
      ...settings,
      freeShippingThreshold: Math.max(0, Number(freeShipInput) || 0),
      standardShippingCost: Math.max(0, Number(shipCostInput) || 0),
      supportUsername: supportUserInput.replace(/^@/, '').trim() || 'dybriansik'
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 1800);
  };

  const handleExportBackup = () => {
    haptic.medium();
    const data = { products, infoItems, orders, promos, settings, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scredtres-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        onImportBackup(parsed);
        haptic.success();
      } catch {
        haptic.error();
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const tabs = [
    { id: 'products', label: `Товары (${products.length})`, icon: Package },
    { id: 'info', label: `Инфо (${infoItems.length})`, icon: FileText },
    { id: 'orders', label: `Заказы (${orders.length})`, icon: ShoppingBag },
    { id: 'promos', label: `Промокоды (${promos.length})`, icon: Tag },
    ...(isOwner ? [{ id: 'settings', label: 'Настройки', icon: Settings }] : [])
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      
      {/* Top Role Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#141414] pb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-black font-cinzel text-white uppercase tracking-wider">
            {isOwner ? 'Панель владельца' : 'Панель поддержки'}
          </h2>
          <p className="text-xs text-[#777777] mt-0.5">
            {isOwner
              ? 'Полный доступ · @dybriansik'
              : 'Управление каталогом, заказами, инфо и просмотр промокодов'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {typeof onRefreshCatalog === 'function' && (
            <button
              type="button"
              onClick={() => {
                haptic.light();
                onRefreshCatalog();
              }}
              disabled={isRefreshing}
              title="Обновить данные с сервера"
              className="px-3 py-1 rounded-full border border-[#222222] hover:border-white text-[11px] text-[#aaaaaa] hover:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Обновить</span>
            </button>
          )}
          <span
            className={`px-3 py-1 rounded-full border text-[11px] ${
              dbError
                ? 'border-white text-white bg-[#1a1a1a]'
                : 'border-[#222222] text-[#aaaaaa]'
            }`}
          >
            {dbError
              ? 'Ошибка Turso'
              : dbConfigured
              ? 'Turso SQLite: подключена'
              : 'Локальное хранение'}
          </span>
          <span className="px-3.5 py-1 rounded-full bg-white text-black text-xs font-semibold">
            {role === ROLES.ADMIN ? 'ADMIN' : 'SUPPORT'}
          </span>
        </div>
      </div>

      {dbConfigured &&
        (localUnsyncedCount > 0 || localSyncNotice) &&
        typeof onSyncLocalToTurso === 'function' && (
          <div className="p-3.5 bg-[#080808] border border-[#2a2a2a] rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="space-y-1 min-w-0 flex-1">
              {localUnsyncedCount > 0 && (
                <p className="text-[#cccccc]">
                  На этом устройстве сохранены локальные товары ({localUnsyncedCount} шт.) до включения БД.
                </p>
              )}
              {localSyncNotice && (
                <p
                  className={
                    localSyncNotice.startsWith('Ошибка')
                      ? 'text-white font-medium'
                      : 'text-[#aaaaaa]'
                  }
                >
                  {localSyncNotice}
                </p>
              )}
            </div>
            {localUnsyncedCount > 0 ? (
              <button
                type="button"
                disabled={isSyncingLocal}
                onClick={() => {
                  haptic.medium();
                  onSyncLocalToTurso();
                }}
                className="px-4 py-2 rounded-full bg-white text-black font-semibold hover:bg-[#dddddd] cursor-pointer disabled:opacity-60 inline-flex items-center gap-1.5 shrink-0"
              >
                {isSyncingLocal && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSyncingLocal ? 'Перенос...' : 'Перенести в Turso'}</span>
              </button>
            ) : (
              typeof onDismissLocalSyncNotice === 'function' && (
                <button
                  type="button"
                  onClick={() => {
                    haptic.light();
                    onDismissLocalSyncNotice();
                  }}
                  className="p-1.5 rounded-full text-[#888888] hover:text-white cursor-pointer shrink-0"
                  aria-label="Закрыть уведомление"
                >
                  <X className="w-4 h-4" />
                </button>
              )
            )}
          </div>
        )}

      {/* Section Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = section === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                haptic.select();
                setSection(tab.id);
                if (tab.id === 'orders' && typeof onRefreshCatalog === 'function') {
                  onRefreshCatalog();
                }
              }}
              className={`px-4 py-2 rounded-full text-xs border flex items-center gap-2 shrink-0 transition-colors cursor-pointer ${
                active
                  ? 'bg-white text-black font-semibold border-white'
                  : 'bg-[#080808] text-[#888888] border-[#222222] hover:text-white hover:border-[#444444]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ==================== SECTION: PRODUCTS ==================== */}
      {section === 'products' && (
        <div className="space-y-4">
          {!editingProduct ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#888888]">
                  Позиции каталога ({products.length})
                </span>
                <button
                  onClick={openNewProductForm}
                  className="px-4 py-2.5 rounded-full bg-white text-black hover:bg-[#dddddd] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Добавить товар</span>
                </button>
              </div>

              {products.length === 0 ? (
                <div className="p-10 text-center border border-[#161616] rounded-2xl bg-[#060606] space-y-3">
                  <Package className="w-8 h-8 text-[#444444] mx-auto" />
                  <p className="text-xs text-[#777777]">
                    В каталоге пока нет ни одного товара. Нажмите «Добавить товар», чтобы выставить первую позицию.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {products.map((p) => {
                    const isPre = p.availability === 'pre_order';
                    return (
                      <div
                        key={p.id}
                        className="p-3.5 bg-[#080808] border border-[#1a1a1a] rounded-xl flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-14 rounded-lg bg-[#141416] border border-[#222222] overflow-hidden shrink-0 flex items-center justify-center p-1">
                            {p.images?.[0] ? (
                              <img src={p.images[0]} alt="" className="w-full h-full object-contain" />
                            ) : (
                              <Package className="w-4 h-4 text-[#444444]" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-white truncate">
                              {p.name}
                            </div>
                            <div className="text-[11px] text-[#777777] flex flex-wrap items-center gap-2 mt-0.5">
                              <span className="text-white font-medium">{formatPrice(p.price)}</span>
                              <span>·</span>
                              <span>{isPre ? 'Под заказ' : 'В наличии'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => openEditProductForm(p)}
                            aria-label="Редактировать"
                            className="w-8 h-8 rounded-full border border-[#222222] hover:border-white flex items-center justify-center text-[#aaaaaa] hover:text-white cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              haptic.medium();
                              onDeleteProduct(p.id);
                            }}
                            aria-label="Удалить"
                            className="w-8 h-8 rounded-full border border-[#222222] hover:border-white flex items-center justify-center text-[#aaaaaa] hover:text-white cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* Product Add/Edit Form */
            <form onSubmit={handleSubmitProduct} className="p-4 sm:p-5 bg-[#080808] border border-[#1f1f1f] rounded-2xl space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-[#141414] pb-3">
                <h3 className="text-sm font-semibold text-white">
                  {editingProduct.id ? 'Редактировать товар' : 'Новый товар'}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="w-8 h-8 rounded-full border border-[#222222] flex items-center justify-center text-[#888888] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {productError && (
                <div className="p-3 rounded-xl border border-white bg-[#141414] text-white">
                  {productError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#777777] mb-1">Название товара *</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    placeholder="Напр. Balenciaga Track Black"
                    className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[#777777] mb-1">Бренд (опционально)</label>
                  <input
                    type="text"
                    value={editingProduct.brand}
                    onChange={(e) => setEditingProduct({ ...editingProduct, brand: e.target.value })}
                    placeholder="Напр. Rick Owens"
                    className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#777777] mb-1">Категория</label>
                  <select
                    value={editingProduct.category}
                    onChange={(e) => setEditingProduct({ ...editingProduct, category: e.target.value })}
                    className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                  >
                    {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-[#777777] mb-1">Срок доставки</label>
                  <input
                    type="text"
                    value={editingProduct.deliveryDays}
                    onChange={(e) => setEditingProduct({ ...editingProduct, deliveryDays: e.target.value })}
                    placeholder="Напр. 7-15 дней"
                    className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                  />
                </div>
              </div>

              {/* Availability Status */}
              <div className="space-y-1.5">
                <label className="block text-[11px] text-[#777777]">Наличие</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleAvailabilityChange('in_stock')}
                    className={`py-2.5 rounded-full border text-xs font-medium cursor-pointer transition-colors ${
                      editingProduct.availability === 'in_stock'
                        ? 'bg-white text-black border-white'
                        : 'bg-black text-[#888888] border-[#222222]'
                    }`}
                  >
                    В наличии
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAvailabilityChange('pre_order')}
                    className={`py-2.5 rounded-full border text-xs font-medium cursor-pointer transition-colors ${
                      editingProduct.availability === 'pre_order'
                        ? 'bg-white text-black border-white'
                        : 'bg-black text-[#888888] border-[#222222]'
                    }`}
                  >
                    Под заказ (из Китая)
                  </button>
                </div>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#777777] mb-1">Цена (₽) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={editingProduct.price}
                    onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value })}
                    placeholder="12500"
                    className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#777777] mb-1">Старая цена (₽)</label>
                  <input
                    type="number"
                    min="0"
                    value={editingProduct.oldPrice}
                    onChange={(e) => setEditingProduct({ ...editingProduct, oldPrice: e.target.value })}
                    placeholder="15000"
                    className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                  />
                </div>
              </div>

              {/* Sizes */}
              <div className="space-y-2">
                <label className="block text-[11px] text-[#777777]">Размеры</label>
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_SIZES.map((sz) => {
                    const active = editingProduct.sizes.includes(sz);
                    return (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => handleToggleSize(sz)}
                        className={`px-3.5 py-1.5 rounded-full border text-xs cursor-pointer transition-colors ${
                          active
                            ? 'bg-white text-black font-semibold border-white'
                            : 'bg-black text-[#888888] border-[#222222]'
                        }`}
                      >
                        {sz}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={editingProduct.customSizesInput}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, customSizesInput: e.target.value })
                  }
                  placeholder="Свои размеры через запятую (напр. 40, 41, 42, 43)"
                  className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2 rounded-xl outline-none mt-1"
                />
              </div>

              {/* Images */}
              <div className="space-y-2">
                <label className="block text-[11px] text-[#777777]">Фотографии</label>
                <div className="flex flex-wrap gap-2">
                  <label className="px-4 py-2.5 rounded-full border border-[#333333] hover:border-white text-white text-xs flex items-center gap-2 cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isCompressing ? 'Сжатие...' : 'Загрузить с устройства'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={editingProduct.imageUrlInput}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, imageUrlInput: e.target.value })
                    }
                    placeholder="Или вставьте ссылку на фото (https://...)"
                    className="flex-1 bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2 rounded-full outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddImageUrl}
                    className="px-4 py-2 rounded-full border border-[#333333] hover:border-white text-white text-xs cursor-pointer"
                  >
                    Добавить
                  </button>
                </div>

                {editingProduct.images.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto py-1">
                    {editingProduct.images.map((src, idx) => (
                      <div key={idx} className="relative w-16 h-20 rounded-lg bg-[#141416] overflow-hidden border border-[#2a2a2a] shrink-0 p-1">
                        <img src={src} alt="" className="w-full h-full object-contain" />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/80 text-white flex items-center justify-center text-[10px] cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Description & Details */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-[#777777] mb-1">Описание</label>
                  <textarea
                    rows={3}
                    value={editingProduct.description}
                    onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                    placeholder="Информация о вещи, легит-чеке, материалах..."
                    className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#777777] mb-1">
                    Особенности (каждый пункт с новой строки)
                  </label>
                  <textarea
                    rows={3}
                    value={editingProduct.detailsText}
                    onChange={(e) => setEditingProduct({ ...editingProduct, detailsText: e.target.value })}
                    placeholder={"Плотный хлопок\nДоставка 7-15 дней"}
                    className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-5 py-3 rounded-full border border-[#222222] text-[#aaaaaa] hover:text-white text-xs cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSavingProduct}
                  className="flex-1 py-3 rounded-full bg-white text-black hover:bg-[#dddddd] text-xs font-semibold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  {isSavingProduct ? 'Сохранение...' : 'Сохранить товар'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ==================== SECTION: INFO / SUPPORT ANSWERS ==================== */}
      {section === 'info' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#888888]">
              Инфо-блоки для клиентов ({infoItems.length})
            </span>
            {!editingInfo && (
              <button
                onClick={handleStartNewInfo}
                className="px-4 py-2.5 rounded-full bg-white text-black hover:bg-[#dddddd] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Добавить запись</span>
              </button>
            )}
          </div>

          {editingInfo && (
            <form onSubmit={handleSaveInfoSubmit} className="p-4 bg-[#080808] border border-[#1f1f1f] rounded-2xl space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">
                  {editingInfo.id ? 'Редактировать запись' : 'Новая запись'}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingInfo(null)}
                  className="text-[#777777] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <input
                type="text"
                required
                value={infoTitle}
                onChange={(e) => setInfoTitle(e.target.value)}
                placeholder="Заголовок (напр. Условия заказа / Доставка)"
                className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
              />

              <textarea
                rows={4}
                required
                value={infoContent}
                onChange={(e) => setInfoContent(e.target.value)}
                placeholder="Подробный текст ответа или условия работы..."
                className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none resize-none"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingInfo(null)}
                  className="px-4 py-2.5 rounded-full border border-[#222222] text-[#aaaaaa] cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-full bg-white text-black font-semibold uppercase tracking-wider cursor-pointer"
                >
                  Сохранить
                </button>
              </div>
            </form>
          )}

          {infoItems.length === 0 ? (
            <div className="p-8 text-center border border-[#161616] rounded-2xl text-xs text-[#777777]">
              Список пуст. Поддержка приложения и владелец (@dybriansik) могут добавлять сюда актуальную информацию о заказах, сроках и доставке.
            </div>
          ) : (
            <div className="space-y-2.5">
              {infoItems.map((item) => (
                <div key={item.id} className="p-4 bg-[#080808] border border-[#1a1a1a] rounded-xl space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-semibold text-white">{item.title}</h4>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleStartEditInfo(item)}
                        className="w-7 h-7 rounded-full border border-[#222222] hover:border-white flex items-center justify-center text-[#aaaaaa] hover:text-white cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => {
                          haptic.medium();
                          onDeleteInfoItem(item.id);
                        }}
                        className="w-7 h-7 rounded-full border border-[#222222] hover:border-white flex items-center justify-center text-[#aaaaaa] hover:text-white cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-[#888888] leading-relaxed whitespace-pre-line">
                    {item.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================== SECTION: ORDERS ==================== */}
      {section === 'orders' && (() => {
        const query = orderSearchQuery.trim().toLowerCase();
        const statusCounts = orders.reduce((acc, o) => {
          const st = o.status || 'new';
          acc[st] = (acc[st] || 0) + 1;
          return acc;
        }, {});

        const filteredOrders = orders.filter((order) => {
          const st = order.status || 'new';
          if (orderStatusFilter !== 'all' && st !== orderStatusFilter) return false;
          if (!query) return true;
          const itemsHay = (order.items || []).map((it) => it.name || '').join(' ');
          const hay = [
            order.orderId,
            order.customer?.fullName,
            order.customer?.phone,
            order.customer?.telegramUsername,
            order.customer?.telegramId,
            order.delivery?.city,
            order.delivery?.address,
            order.trackingNumber,
            order.comment,
            itemsHay
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return hay.includes(query);
        });

        const handleCopyTgId = async (tgId) => {
          haptic.light();
          const str = String(tgId);
          try {
            await navigator.clipboard?.writeText(str);
            setCopiedTgId(str);
            setTimeout(() => {
              setCopiedTgId((curr) => (curr === str ? '' : curr));
            }, 1500);
          } catch {}
        };

        return (
          <div className="space-y-3">
            {orders.length > 0 && (
              <div className="space-y-2.5">
                {/* Search Orders */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#666666] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    placeholder="Поиск по номеру SCRED-..., клиенту, @username, треку..."
                    className="w-full bg-[#080808] border border-[#1f1f1f] focus:border-white text-white text-xs pl-9 pr-9 py-2.5 rounded-full outline-none placeholder-[#555555]"
                  />
                  {orderSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setOrderSearchQuery('')}
                      aria-label="Очистить поиск заказов"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666666] hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      haptic.select();
                      setOrderStatusFilter('all');
                    }}
                    className={`px-3 py-1.5 rounded-full text-[11px] border shrink-0 transition-colors cursor-pointer ${
                      orderStatusFilter === 'all'
                        ? 'bg-white text-black font-semibold border-white'
                        : 'bg-[#080808] text-[#888888] border-[#1f1f1f] hover:text-white'
                    }`}
                  >
                    Все ({orders.length})
                  </button>
                  {ORDER_STATUSES.map((st) => {
                    const count = statusCounts[st.id] || 0;
                    const active = orderStatusFilter === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          haptic.select();
                          setOrderStatusFilter(st.id);
                        }}
                        className={`px-3 py-1.5 rounded-full text-[11px] border shrink-0 transition-colors cursor-pointer ${
                          active
                            ? 'bg-white text-black font-semibold border-white'
                            : 'bg-[#080808] text-[#888888] border-[#1f1f1f] hover:text-white'
                        }`}
                      >
                        {st.name} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {orders.length === 0 ? (
              <div className="p-8 text-center border border-[#161616] rounded-2xl text-xs text-[#777777]">
                Пока нет оформленных заказов.
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-8 text-center border border-[#161616] rounded-2xl text-xs text-[#777777] space-y-2.5">
                <p>По выбранному фильтру заказов не найдено.</p>
                <button
                  type="button"
                  onClick={() => {
                    setOrderStatusFilter('all');
                    setOrderSearchQuery('');
                  }}
                  className="px-4 py-2 rounded-full border border-[#333333] hover:border-white text-white text-xs cursor-pointer"
                >
                  Сбросить фильтры
                </button>
              </div>
            ) : (
              filteredOrders.map((order) => {
                const draftTrack =
                  trackingDrafts[order.orderId] !== undefined
                    ? trackingDrafts[order.orderId]
                    : order.trackingNumber || '';
                const tgIdNum = Number(order.customer?.telegramId) || 0;
                const isTgIdCopied = tgIdNum > 0 && copiedTgId === String(tgIdNum);
                const isTrackSaved = savedTrackingId === order.orderId;

                return (
                  <div key={order.orderId} className="p-4 bg-[#080808] border border-[#1a1a1a] rounded-xl space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#141414] pb-2">
                      <div>
                        <span className="font-semibold text-white">{order.orderId}</span>
                        <span className="text-[#666666] ml-2 text-[11px]">
                          {new Date(order.timestamp).toLocaleString('ru-RU')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">
                          {formatPrice(order.pricing?.total)}
                        </span>
                        {isOwner && (
                          <button
                            onClick={() => {
                              haptic.medium();
                              onDeleteOrder(order.orderId);
                            }}
                            className="w-7 h-7 rounded-full border border-[#222222] hover:border-white flex items-center justify-center text-[#777777] hover:text-white cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Customer Info */}
                    <div className="space-y-1 text-[#999999]">
                      <div>
                        Получатель:{' '}
                        <span className="text-white">
                          {order.customer?.fullName || 'Покупатель'}
                        </span>
                        {order.customer?.phone ? ` (${order.customer.phone})` : ''}
                      </div>
                      {order.customer?.telegramUsername ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span>Telegram:</span>
                          <button
                            type="button"
                            onClick={() =>
                              openTelegramLink(
                                `https://t.me/${order.customer.telegramUsername.replace(/^@/, '')}`
                              )
                            }
                            className="text-white underline underline-offset-4 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>{order.customer.telegramUsername}</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                          {tgIdNum > 0 && (
                            <span className="text-[11px] font-mono text-[#666666]">
                              · ID {tgIdNum}
                            </span>
                          )}
                        </div>
                      ) : (
                        tgIdNum > 0 && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span>Telegram: юзернейм скрыт ·</span>
                            <button
                              type="button"
                              onClick={() => handleCopyTgId(tgIdNum)}
                              className="px-2 py-0.5 rounded-full bg-black border border-[#262626] hover:border-white text-[11px] font-mono text-white inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>{isTgIdCopied ? 'Скопировано' : `ID ${tgIdNum}`}</span>
                              {isTgIdCopied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                            </button>
                            <a
                              href={`tg://user?id=${tgIdNum}`}
                              className="text-[11px] text-white underline underline-offset-4 inline-flex items-center gap-1"
                            >
                              <span>Профиль</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        )
                      )}
                      <div>
                        Доставка:{' '}
                        <span className="text-white">
                          {getDeliveryMethodLabel(order.delivery?.method)}
                        </span>
                        {order.delivery?.method !== 'pickup_blg' &&
                          ` — ${order.delivery?.city}, ${order.delivery?.address}`}
                      </div>
                      <div>
                        Оплата:{' '}
                        <span className="text-white">
                          {order.delivery?.method === 'pickup_blg'
                            ? 'Обговор с владельцем (@dybriansik)'
                            : getPaymentMethodLabel(order.paymentMethod)}
                        </span>
                      </div>
                      {order.pricing?.promoCode && (
                        <div>
                          Промокод: <span className="text-white font-mono">{order.pricing.promoCode}</span>
                          {Number(order.pricing?.discount) > 0 && ` (-${formatPrice(order.pricing.discount)})`}
                        </div>
                      )}
                    </div>

                    {/* Items */}
                    <div className="p-2.5 bg-black border border-[#141414] rounded-lg space-y-2">
                      {(order.items || []).map((it, idx) => {
                        const liveProd = products.find((p) => p.id === it.id) || null;
                        const thumb = liveProd?.images?.[0] || it.image || '';
                        const canOpen = Boolean(liveProd && typeof onOpenProduct === 'function');
                        return (
                          <div
                            key={idx}
                            onClick={
                              canOpen
                                ? () => {
                                    haptic.light();
                                    onOpenProduct(liveProd);
                                  }
                                : undefined
                            }
                            className={`flex items-center justify-between gap-2.5 text-[11px] rounded-lg p-1 -m-1 transition-colors ${
                              canOpen ? 'hover:bg-[#111111] cursor-pointer' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-10 h-10 rounded-lg bg-[#141416] border border-[#222222] overflow-hidden shrink-0 flex items-center justify-center p-0.5">
                                {thumb ? (
                                  <img
                                    src={thumb}
                                    alt={it.name}
                                    loading="lazy"
                                    className="w-full h-full object-contain"
                                  />
                                ) : (
                                  <Package className="w-4 h-4 text-[#555555]" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[#e5e5e5] font-medium truncate">
                                  {it.name}
                                </div>
                                <div className="text-[10px] text-[#777777] flex items-center gap-1.5">
                                  <span>
                                    {it.size} × {it.quantity}
                                  </span>
                                  {canOpen && (
                                    <span className="text-[#aaaaaa] inline-flex items-center gap-0.5 underline underline-offset-2">
                                      Открыть
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <span className="text-white font-medium shrink-0">
                              {formatPrice(it.price * it.quantity)}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Order Comment */}
                    {order.comment ? (
                      <div className="p-3 bg-black border border-[#262626] rounded-xl space-y-1">
                        <div className="text-[10px] uppercase tracking-wider text-[#777777]">
                          Комментарий к заказу
                        </div>
                        <p className="text-xs text-white leading-relaxed whitespace-pre-line break-words select-text">
                          {order.comment}
                        </p>
                      </div>
                    ) : (
                      <div className="text-[11px] text-[#555555]">
                        Комментарий к заказу: не указан
                      </div>
                    )}

                    {/* Status & Tracking */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <select
                        value={order.status || 'new'}
                        onChange={(e) => {
                          haptic.select();
                          onUpdateOrder(order.orderId, { status: e.target.value });
                        }}
                        className="bg-black border border-[#222222] focus:border-white text-white px-3 py-2 rounded-full outline-none"
                      >
                        {ORDER_STATUSES.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.name}
                          </option>
                        ))}
                      </select>

                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={draftTrack}
                          onChange={(e) =>
                            setTrackingDrafts({ ...trackingDrafts, [order.orderId]: e.target.value })
                          }
                          placeholder="Трек-номер"
                          className="flex-1 bg-black border border-[#222222] focus:border-white text-white px-3 py-2 rounded-full outline-none"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            haptic.success();
                            await onUpdateOrder(order.orderId, { trackingNumber: draftTrack.trim() });
                            setSavedTrackingId(order.orderId);
                            setTimeout(() => {
                              setSavedTrackingId((curr) => (curr === order.orderId ? '' : curr));
                            }, 1600);
                          }}
                          className="px-3 py-2 rounded-full bg-white text-black font-semibold cursor-pointer inline-flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {isTrackSaved && <span className="text-[10px]">OK</span>}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        );
      })()}

      {/* ==================== SECTION: PROMOS (VISIBLE TO OWNER & SUPPORT) ==================== */}
      {section === 'promos' && (
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-[#080808] border border-[#1a1a1a] rounded-2xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-white">Промокоды ({promos.length})</h3>
                <p className="text-[11px] text-[#777777] mt-0.5">
                  {isOwner
                    ? 'Скрыты от покупателей — список виден только владельцу и поддержке. Покупатель может лишь ввести код в корзине.'
                    : 'Скрыты от покупателей. Просмотр доступен поддержке; добавлять и удалять коды может только владелец (@dybriansik).'}
                </p>
              </div>
            </div>

            {isOwner && (
              <form onSubmit={handlePromoSubmit} className="space-y-2">
                <div className="flex flex-wrap sm:flex-nowrap gap-2">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value.toUpperCase());
                      if (promoError) setPromoError('');
                    }}
                    placeholder="Код (напр. SCRED10)"
                    className="flex-1 min-w-[160px] bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-full uppercase outline-none"
                  />
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={promoPercent}
                    onChange={(e) => setPromoPercent(e.target.value)}
                    placeholder="%"
                    className="w-20 bg-black border border-[#222222] focus:border-white text-white px-3 py-2.5 rounded-full outline-none text-center"
                  />
                  <button
                    type="submit"
                    disabled={isSavingPromo}
                    className="px-5 py-2.5 rounded-full bg-white text-black hover:bg-[#dddddd] font-semibold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isSavingPromo ? '...' : 'Добавить'}</span>
                  </button>
                </div>
                {promoError && <p className="text-[11px] text-white px-1">{promoError}</p>}
              </form>
            )}

            {promos.length === 0 ? (
              <div className="p-6 text-center border border-[#161616] rounded-xl bg-black/50 text-[#777777]">
                {isOwner
                  ? 'Активных промокодов пока нет. Добавьте первый код выше.'
                  : 'Владелец ещё не добавил активных промокодов.'}
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                {promos.map((p) => {
                  const isCopied = copiedPromoCode === p.code;
                  return (
                    <div
                      key={p.code}
                      className="px-3.5 py-2.5 rounded-xl bg-black border border-[#222222] flex items-center justify-between gap-2 text-white"
                    >
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="font-mono font-bold tracking-wider text-white">
                          {p.code}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-[#141414] border border-[#262626] text-[11px] text-[#dddddd]">
                          -{p.discountPercent}%
                        </span>
                        {p.createdAt && (
                          <span className="text-[10px] text-[#666666]">
                            {new Date(p.createdAt).toLocaleDateString('ru-RU')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyPromo(p.code)}
                          title="Скопировать промокод"
                          className="px-2.5 py-1 rounded-full border border-[#222222] hover:border-white text-[11px] text-[#aaaaaa] hover:text-white inline-flex items-center gap-1 cursor-pointer"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3 h-3 text-white" />
                              <span>Скопировано</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Копия</span>
                            </>
                          )}
                        </button>
                        {isOwner && (
                          <button
                            type="button"
                            onClick={() => {
                              haptic.light();
                              onDeletePromo(p.code);
                            }}
                            aria-label={`Удалить промокод ${p.code}`}
                            className="w-7 h-7 rounded-full border border-[#222222] hover:border-white flex items-center justify-center text-[#777777] hover:text-white cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== SECTION: SETTINGS (OWNER ONLY) ==================== */}
      {section === 'settings' && isOwner && (
        <div className="space-y-6 text-xs">

          {/* Delivery & Support Contact Settings */}
          <form onSubmit={handleSettingsSubmit} className="p-4 bg-[#080808] border border-[#1a1a1a] rounded-2xl space-y-3">
            <h3 className="text-sm font-semibold text-white">Доставка и контакты</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#777777] mb-1">
                  Порог бесплатной доставки (₽)
                </label>
                <input
                  type="number"
                  min="0"
                  value={freeShipInput}
                  onChange={(e) => setFreeShipInput(e.target.value)}
                  className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#777777] mb-1">
                  Стоимость доставки СДЭК по РФ (₽)
                </label>
                <input
                  type="number"
                  min="0"
                  value={shipCostInput}
                  onChange={(e) => setShipCostInput(e.target.value)}
                  className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-[#777777] mb-1">
                Юзернейм поддержки (без @)
              </label>
              <input
                type="text"
                value={supportUserInput}
                onChange={(e) => setSupportUserInput(e.target.value)}
                className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-full bg-white text-black font-semibold uppercase tracking-wider cursor-pointer"
            >
              {settingsSaved ? 'Настройки сохранены ✓' : 'Сохранить настройки'}
            </button>
          </form>

          {/* Backup & Restore */}
          <div className="p-4 bg-[#080808] border border-[#1a1a1a] rounded-2xl space-y-3">
            <h3 className="text-sm font-semibold text-white">Резервная копия данных</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExportBackup}
                className="px-4 py-2.5 rounded-full border border-[#333333] hover:border-white text-white flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Скачать JSON</span>
              </button>

              <label className="px-4 py-2.5 rounded-full border border-[#333333] hover:border-white text-white flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Загрузить JSON</span>
                <input type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
              </label>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
