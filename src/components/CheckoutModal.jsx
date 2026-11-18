import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { getTelegramUser, submitOrderToServer, openTelegramLink, haptic } from '../utils/telegram';
import { formatPrice } from '../utils/store';
import {
  PAYMENT_METHODS,
  getDeliveryMethodLabel,
  getPaymentMethodLabel
} from '../data/products';

const DELIVERY_METHOD = 'cdek_pvz';

export default function CheckoutModal({ 
  isOpen, 
  onClose, 
  orderSummary, 
  supportUsername = 'dybriansik',
  dbConfigured = false,
  devRoleOverride,
  onOrderSuccess 
}) {
  const tgUser = getTelegramUser(devRoleOverride);
  const supportHandle = (supportUsername || 'dybriansik').replace(/^@/, '');

  const [fullName, setFullName] = useState(
    [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || ''
  );
  const [phone, setPhone] = useState('+7 ');
  const [telegramUsername, setTelegramUsername] = useState(
    tgUser.username ? `@${tgUser.username}` : ''
  );
  const [city, setCity] = useState('Москва');
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('sbp_card');
  const [comment, setComment] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderComplete, setOrderComplete] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setOrderComplete(null);
      setFormError('');
    }
  }, [isOpen]);

  if (!isOpen || !orderSummary) return null;

  const hasPreOrderItems = orderSummary.items.some(
    (i) => i.product.availability === 'pre_order'
  );

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError('');

    const cleanName = fullName.trim();
    const phoneDigits = phone.replace(/\D/g, '');
    const cleanCity = city.trim();
    const cleanAddress = address.trim();

    if (!cleanName || cleanName.length < 2) {
      setFormError('Укажите корректные имя и фамилию получателя.');
      haptic.error();
      return;
    }

    if (phoneDigits.length < 10) {
      setFormError('Введите корректный номер телефона (минимум 10 цифр).');
      haptic.error();
      return;
    }

    if (!cleanCity || !cleanAddress) {
      setFormError('Укажите город и адрес доставки.');
      haptic.error();
      return;
    }

    setIsSubmitting(true);
    haptic.heavy();

    const orderId = `SCRED-${Math.floor(100000 + Math.random() * 900000)}`;
    const timestamp = new Date().toISOString();

    const orderData = {
      orderId,
      timestamp,
      status: 'new',
      trackingNumber: '',
      customer: {
        fullName: cleanName,
        phone: phone.trim(),
        telegramUsername: telegramUsername.trim(),
        telegramId: tgUser.id
      },
      delivery: {
        method: DELIVERY_METHOD,
        city: cleanCity,
        address: cleanAddress
      },
      paymentMethod,
      comment: comment.trim(),
      items: orderSummary.items.map((i) => ({
        id: i.product.id,
        name: i.product.name,
        size: i.size,
        availability: i.product.availability || 'in_stock',
        price: i.product.price,
        quantity: i.quantity
      })),
      pricing: {
        subtotal: orderSummary.subtotal,
        discount: orderSummary.discountAmount,
        shipping: orderSummary.shippingCost,
        total: orderSummary.total,
        promoCode: orderSummary.appliedPromo?.code || null
      }
    };

    const serverRes = await submitOrderToServer(orderData);
    if ((serverRes?.configured || serverRes?.error || dbConfigured) && !serverRes?.ok) {
      setIsSubmitting(false);
      setFormError(serverRes?.error || 'Не удалось сохранить заказ. Попробуйте снова.');
      haptic.error();
      return;
    }

    const finalOrder = serverRes?.orderRecord || orderData;

    setIsSubmitting(false);
    setOrderComplete(finalOrder);
    setComment('');
    haptic.success();
    onOrderSuccess(finalOrder);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-[#080808] border border-[#1f1f1f] rounded-t-2xl sm:rounded-2xl z-10 max-h-[96vh] flex flex-col overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#141414] flex items-center justify-between bg-black">
          <span className="text-sm font-semibold tracking-wider text-white uppercase">
            Оформление заказа
          </span>
          <button
            onClick={() => {
              haptic.light();
              onClose();
            }}
            aria-label="Закрыть оформление"
            className="w-8 h-8 rounded-full border border-[#222222] flex items-center justify-center text-[#888888] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-5 space-y-6">
          {orderComplete ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-12 h-12 rounded-full border border-white mx-auto flex items-center justify-center bg-white text-black shadow-lg">
                <Check className="w-6 h-6" />
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-semibold text-white">
                  Заказ принят
                </h3>
                <div className="text-xs text-[#888888]">
                  Номер заказа: <span className="text-white font-medium">{orderComplete.orderId}</span>
                </div>
              </div>

              <p className="text-xs text-[#888888] max-w-sm mx-auto leading-relaxed">
                {hasPreOrderItems
                  ? `В заказе есть позиции под заказ (7-15 дней). Заказ передан в панель магазина — поддержка (@${supportHandle}) свяжется с вами для подтверждения.`
                  : `Заказ передан в панель магазина. Поддержка (@${supportHandle}) свяжется с вами в Telegram для подтверждения и отправки трек-номера СДЭК.`}
              </p>

              {/* Formed Order Receipt Summary (including comment) */}
              <div className="text-left p-4 bg-black border border-[#1f1f1f] rounded-2xl space-y-2.5 text-xs max-w-sm mx-auto">
                <div className="space-y-1">
                  {(orderComplete.items || []).map((it, idx) => (
                    <div key={idx} className="flex justify-between gap-2 text-[11px]">
                      <span className="text-[#cccccc] truncate">
                        {it.name} ({it.size}) × {it.quantity}
                      </span>
                      <span className="text-white shrink-0">
                        {formatPrice(it.price * it.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-[#141414] space-y-1 text-[11px] text-[#999999]">
                  <div>
                    Доставка:{' '}
                    <span className="text-white">
                      {getDeliveryMethodLabel(orderComplete.delivery?.method)}
                    </span>{' '}
                    — {orderComplete.delivery?.city}, {orderComplete.delivery?.address}
                  </div>
                  <div>
                    Оплата:{' '}
                    <span className="text-white">
                      {getPaymentMethodLabel(orderComplete.paymentMethod)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs pt-1">
                    <span className="text-[#888888]">Итого:</span>
                    <span className="font-bold text-white">
                      {formatPrice(orderComplete.pricing?.total)}
                    </span>
                  </div>
                </div>

                {orderComplete.comment && (
                  <div className="p-2.5 bg-[#080808] border border-[#242424] rounded-xl space-y-1">
                    <div className="text-[10px] uppercase tracking-wider text-[#777777]">
                      Комментарий к заказу
                    </div>
                    <p className="text-xs text-white whitespace-pre-line break-words">
                      {orderComplete.comment}
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2.5 pt-2 max-w-xs mx-auto">
                <button
                  type="button"
                  onClick={() => {
                    haptic.light();
                    openTelegramLink(`https://t.me/${supportHandle}`);
                  }}
                  className="w-full py-3 rounded-full border border-[#333333] hover:border-white text-white text-xs font-medium tracking-wider uppercase transition-colors cursor-pointer"
                >
                  Написать поддержке @{supportHandle}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    haptic.medium();
                    onClose();
                  }}
                  className="w-full py-3 rounded-full bg-white text-black text-xs font-semibold tracking-wider uppercase hover:bg-[#dddddd] transition-colors cursor-pointer shadow-md"
                >
                  Вернуться в магазин
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitOrder} className="space-y-5 text-xs">
              
              {formError && (
                <div className="p-3 rounded-xl border border-white bg-[#141414] text-white flex items-center gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Recipient */}
              <div className="space-y-3">
                <span className="text-[#888888] uppercase tracking-wider block font-medium">
                  Получатель
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#666666] mb-1">Имя и фамилия *</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Иван Иванов"
                      className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#666666] mb-1">Телефон *</label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+7 999 000-00-00"
                      className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-[#666666] mb-1">Telegram логин</label>
                  <input
                    type="text"
                    value={telegramUsername}
                    onChange={(e) => setTelegramUsername(e.target.value)}
                    placeholder="@username"
                    className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                  />
                </div>
              </div>

              {/* Delivery method (СДЭК only) */}
              <div className="space-y-3 pt-2 border-t border-[#141414]">
                <span className="text-[#888888] uppercase tracking-wider block font-medium">
                  Доставка
                </span>

                <div className="p-3 rounded-xl border border-white/25 bg-[#111111] flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-xs text-white">СДЭК · Пункт выдачи (ПВЗ)</div>
                    <div className="text-[10px] text-[#888888] mt-0.5">По РФ и СНГ</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-white text-black text-[10px] font-semibold uppercase tracking-wider shrink-0">
                    СДЭК
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#666666] mb-1">Город *</label>
                    <input
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Москва"
                      className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-[#666666] mb-1">
                      Адрес ПВЗ СДЭК *
                    </label>
                    <input
                      type="text"
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="ул. Тверская, 12"
                      className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Payment choice (without Telegram Stars) */}
              <div className="space-y-3 pt-2 border-t border-[#141414]">
                <span className="text-[#888888] uppercase tracking-wider block font-medium">
                  Оплата
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        haptic.select();
                        setPaymentMethod(p.id);
                      }}
                      className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                        paymentMethod === p.id
                          ? 'border-white bg-[#141414] text-white font-medium'
                          : 'border-[#222222] text-[#666666] hover:border-[#444444]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment */}
              <div>
                <label className="block text-[11px] text-[#666666] mb-1">Комментарий к заказу</label>
                <textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Пожелания по выкупу, размерам или доставке..."
                  className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none resize-none"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-full bg-white text-black hover:bg-[#dddddd] text-xs font-semibold tracking-wider uppercase transition-colors cursor-pointer disabled:opacity-50 shadow-md"
              >
                {isSubmitting ? 'Оформление...' : `Подтвердить заказ · ${formatPrice(orderSummary.total)}`}
              </button>

            </form>
          )}
        </div>

      </div>
    </div>
  );
}
