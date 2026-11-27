import React, { useState, useEffect } from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag, ImageOff, AlertCircle } from 'lucide-react';
import { haptic, openTelegramLink } from '../utils/telegram';
import { formatPrice } from '../utils/store';
import { validatePromoCodeServer } from '../utils/api';

export default function CartDrawer({
  isOpen,
  onClose,
  items,
  promos = [],
  appliedPromo = null,
  onAppliedPromoChange,
  hasPromos = false,
  dbConfigured = false,
  isBrowserGuest = false,
  cartNotice = '',
  onDismissCartNotice,
  settings,
  onUpdateQuantity,
  onRemoveItem,
  onProceedToCheckout
}) {
  const [promoInput, setPromoInput] = useState('');
  const [promoError, setPromoError] = useState('');
  const [checkingPromo, setCheckingPromo] = useState(false);

  const setAppliedPromo = (next) => {
    onAppliedPromoChange?.(next);
  };

  useEffect(() => {
    if (items.length === 0) {
      onAppliedPromoChange?.(null);
      setPromoError('');
      setPromoInput('');
    }
  }, [items.length, onAppliedPromoChange]);

  if (!isOpen) return null;

  const FREE_SHIPPING_THRESHOLD = settings?.freeShippingThreshold ?? 15000;
  const STANDARD_SHIPPING_COST = settings?.standardShippingCost ?? 490;

  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  const handleApplyPromo = async (e) => {
    e.preventDefault();
    haptic.medium();
    const code = promoInput.trim().toUpperCase();
    if (!code) return;

    if (dbConfigured) {
      setCheckingPromo(true);
      const res = await validatePromoCodeServer(code);
      setCheckingPromo(false);
      if (res.ok && res.promo) {
        setAppliedPromo(res.promo);
        setPromoError('');
        haptic.success();
      } else {
        setPromoError(res.error || 'Промокод не найден');
        haptic.error();
      }
      return;
    }

    const match = promos.find((p) => p.code.toUpperCase() === code);
    if (match) {
      if (match.expiresAt && Date.parse(match.expiresAt) < Date.now()) {
        setPromoError('Срок действия промокода истёк');
        haptic.error();
        return;
      }
      if (match.maxUses && Number(match.usedCount || 0) >= Number(match.maxUses)) {
        setPromoError('Лимит использований промокода исчерпан');
        haptic.error();
        return;
      }
      setAppliedPromo(match);
      setPromoError('');
      haptic.success();
    } else {
      setPromoError('Промокод не найден');
      haptic.error();
    }
  };

  const missingItems =
    appliedPromo?.minItems && totalQuantity < Number(appliedPromo.minItems)
      ? Number(appliedPromo.minItems) - totalQuantity
      : 0;
  const missingSubtotal =
    appliedPromo?.minSubtotal && subtotal < Number(appliedPromo.minSubtotal)
      ? Number(appliedPromo.minSubtotal) - subtotal
      : 0;
  const isPromoActive = Boolean(appliedPromo && missingItems === 0 && missingSubtotal === 0);

  const discountAmount = isPromoActive
    ? Math.round((subtotal * Number(appliedPromo.discountPercent)) / 100)
    : 0;

  const shippingCost =
    subtotal >= FREE_SHIPPING_THRESHOLD || items.length === 0 ? 0 : STANDARD_SHIPPING_COST;

  const total = Math.max(0, subtotal - discountAmount + shippingCost);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-md bg-black border-l border-[#141414] h-full flex flex-col z-10 shadow-2xl">
        
        {/* Header */}
        <div className="p-4 border-b border-[#141414] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-white" />
            <span className="text-xs font-semibold tracking-wider text-white uppercase">
              Корзина ({items.reduce((sum, i) => sum + i.quantity, 0)})
            </span>
          </div>
          <button
            onClick={() => {
              haptic.light();
              onClose();
            }}
            aria-label="Закрыть корзину"
            className="w-8 h-8 rounded-full border border-[#222222] flex items-center justify-center text-[#888888] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Free Shipping Hint */}
        {items.length > 0 && FREE_SHIPPING_THRESHOLD > 0 && (
          <div className="px-4 py-2 border-b border-[#141414] text-[11px] text-[#888888]">
            {subtotal >= FREE_SHIPPING_THRESHOLD ? (
              <span className="text-white">Бесплатная доставка включена</span>
            ) : (
              <span>До бесплатной доставки: {formatPrice(FREE_SHIPPING_THRESHOLD - subtotal)}</span>
            )}
          </div>
        )}

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cartNotice && (
            <div className="p-3 rounded-xl bg-[#111111] border border-[#2c2c2c] text-xs text-[#e5e5e5] flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-white shrink-0 mt-0.5" />
                <span>{cartNotice}</span>
              </div>
              {onDismissCartNotice && (
                <button
                  type="button"
                  onClick={onDismissCartNotice}
                  className="text-[#777777] hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {isBrowserGuest && items.length > 0 && (
            <div className="p-3 rounded-xl bg-[#111111] border border-[#2c2c2c] text-xs text-[#cccccc] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-white shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>
                  Вы просматриваете магазин в браузере. Для оформления заказа откройте приложение в Telegram.
                </p>
                <button
                  type="button"
                  onClick={() => openTelegramLink('https://t.me/dybriansik')}
                  className="text-white underline underline-offset-4 cursor-pointer"
                >
                  Связаться с @dybriansik
                </button>
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
              <ShoppingBag className="w-8 h-8 text-[#444444]" />
              <div className="space-y-1">
                <div className="text-xs font-medium text-white uppercase tracking-wider">
                  Корзина пуста
                </div>
                <p className="text-xs text-[#777777] font-light max-w-xs">
                  Добавьте позиции из каталога в наличии или под заказ из Китая
                </p>
              </div>
              <button
                onClick={() => {
                  haptic.medium();
                  onClose();
                }}
                className="px-6 py-3 rounded-full bg-white text-black text-xs font-semibold uppercase tracking-wider hover:bg-[#dddddd] transition-colors cursor-pointer"
              >
                В каталог
              </button>
            </div>
          ) : (
            items.map((item) => {
              const thumb = item.product.images && item.product.images[0];
              const isPreOrder = item.product.availability === 'pre_order';

              return (
                <div
                  key={`${item.product.id}-${item.size}`}
                  className="p-3 bg-[#080808] border border-[#141414] rounded-xl flex gap-3"
                >
                  {/* Thumb */}
                  <div className="w-18 h-22 bg-[#141416] border border-[#1f1f1f] rounded-lg overflow-hidden shrink-0 flex items-center justify-center p-1">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={item.product.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <ImageOff className="w-4 h-4 text-[#444444]" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 flex flex-col justify-between py-0.5">
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="text-xs font-medium text-white line-clamp-1">
                          {item.product.name}
                        </h4>
                        <button
                          onClick={() => {
                            haptic.light();
                            onRemoveItem(item.product.id, item.size);
                          }}
                          aria-label="Удалить"
                          className="text-[#666666] hover:text-white p-0.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="text-[11px] text-[#777777] mt-1 flex items-center gap-2">
                        <span>Размер: <span className="text-white">{item.size}</span></span>
                        <span>·</span>
                        <span>{isPreOrder ? 'Под заказ' : 'В наличии'}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#141414]">
                      <div className="flex items-center gap-1 border border-[#222222] px-1 py-0.5 rounded-full">
                        <button
                          type="button"
                          onClick={() => {
                            haptic.light();
                            onUpdateQuantity(item.product.id, item.size, item.quantity - 1);
                          }}
                          aria-label="Уменьшить количество"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[#888888] hover:text-white cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-5 text-center text-xs text-white">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            haptic.light();
                            onUpdateQuantity(item.product.id, item.size, item.quantity + 1);
                          }}
                          aria-label="Увеличить количество"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[#888888] hover:text-white cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className="text-xs font-semibold text-white">
                        {formatPrice(item.product.price * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-4 border-t border-[#141414] bg-black space-y-3 safe-pb">
            
            {(hasPromos || promos.length > 0) && (
              <>
                <form onSubmit={handleApplyPromo} className="flex gap-2">
                  <input
                    type="text"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value)}
                    placeholder="Промокод"
                    className="flex-1 bg-[#0a0a0a] border border-[#222222] focus:border-white text-xs text-white px-4 py-2.5 rounded-full outline-none uppercase placeholder-[#555555]"
                  />
                  <button
                    type="submit"
                    disabled={checkingPromo}
                    className="px-4 py-2.5 rounded-full border border-[#262626] hover:border-white text-xs text-white uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {checkingPromo ? '...' : 'Применить'}
                  </button>
                </form>

                {appliedPromo && (
                  <div className="space-y-1 px-1">
                    <div className="text-xs text-white flex justify-between items-center py-0.5">
                      <span>
                        Промокод {appliedPromo.code} (-{appliedPromo.discountPercent}%)
                        {!isPromoActive && (
                          <span className="text-[#888888] ml-1.5 text-[11px]">· условия не выполнены</span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => setAppliedPromo(null)}
                        className="text-[#888888] hover:text-white cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    {!isPromoActive && (
                      <div className="text-[11px] text-[#aaaaaa] bg-[#111111] border border-[#262626] rounded-lg px-2.5 py-1.5">
                        Для активации скидки добавьте ещё:{' '}
                        {[
                          missingItems > 0 ? `${missingItems} шт.` : null,
                          missingSubtotal > 0 ? `на ${formatPrice(missingSubtotal)}` : null
                        ]
                          .filter(Boolean)
                          .join(' и ')}
                        .
                      </div>
                    )}
                  </div>
                )}

                {promoError && (
                  <div className="text-xs text-[#888888] px-1">{promoError}</div>
                )}
              </>
            )}

            {/* Calculations */}
            <div className="space-y-1 text-xs text-[#888888] px-1">
              <div className="flex justify-between">
                <span>Сумма:</span>
                <span className="text-white">{formatPrice(subtotal)}</span>
              </div>
              {isPromoActive && discountAmount > 0 && (
                <div className="flex justify-between text-white">
                  <span>Скидка:</span>
                  <span>-{formatPrice(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Доставка СДЭК:</span>
                <span>{shippingCost === 0 ? 'Бесплатно' : formatPrice(shippingCost)}</span>
              </div>
              {shippingCost > 0 && (
                <div className="text-[10px] text-[#666666]">
                  Самовывоз в Благовещенске — 0 ₽ (выбирается при оформлении)
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-[#141414] text-sm text-white font-semibold">
                <span>Итого к оплате:</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>

            <button
              onClick={() => {
                haptic.heavy();
                onProceedToCheckout({
                  items,
                  subtotal,
                  discountAmount,
                  shippingCost,
                  total,
                  appliedPromo
                });
              }}
              className="w-full py-3.5 rounded-full bg-white text-black hover:bg-[#dddddd] text-xs font-semibold tracking-wider uppercase transition-colors cursor-pointer shadow-md"
            >
              Перейти к оформлению
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
