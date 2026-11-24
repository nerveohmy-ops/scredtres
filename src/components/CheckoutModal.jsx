import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { getTelegramUser, submitOrderToServer, openTelegramLink, haptic } from '../utils/telegram';
import {
  formatPrice,
  PHONE_MAX_LENGTH,
  getRuPhoneDigits,
  formatRuPhone
} from '../utils/store';
import {
  DELIVERY_METHODS,
  PAYMENT_METHODS,
  getDeliveryMethodLabel,
  getPaymentMethodLabel
} from '../data/products';

const OWNER_HANDLE = 'dybriansik';

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
  const [deliveryMethod, setDeliveryMethod] = useState('cdek_pvz');
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
  const isPickupBlg = deliveryMethod === 'pickup_blg';
  const effectiveShipping = isPickupBlg ? 0 : Number(orderSummary.shippingCost) || 0;
  const effectiveTotal = Math.max(
    0,
    (Number(orderSummary.subtotal) || 0) -
      (Number(orderSummary.discountAmount) || 0) +
      effectiveShipping
  );

  const handlePhoneChange = (e) => {
    const raw = e.target.value;
    const prevDigits = getRuPhoneDigits(phone);
    let nextDigits = getRuPhoneDigits(raw);

    // Handle Backspace pressed right on a mask separator (e.g. ")", "-", or space)
    if (raw.length < phone.length && nextDigits === prevDigits && prevDigits.length > 0) {
      nextDigits = prevDigits.slice(0, -1);
    }

    setPhone(formatRuPhone(nextDigits));
  };

  const handlePhonePaste = (e) => {
    const pasted = e.clipboardData?.getData('text') || '';
    if (!pasted) return;
    e.preventDefault();
    const pastedDigits = getRuPhoneDigits(pasted);
    if (pastedDigits.length >= 10 || phone === '+7 ') {
      setPhone(formatRuPhone(pastedDigits));
      return;
    }
    const merged = (getRuPhoneDigits(phone) + pastedDigits).slice(0, 10);
    setPhone(formatRuPhone(merged));
  };

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError('');

    const tgFullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim();
    const cleanName = fullName.trim();
    const phoneDigits = getRuPhoneDigits(phone);
    const cleanCity = city.trim();
    const cleanAddress = address.trim();

    if (!isPickupBlg) {
      if (!cleanName || cleanName.length < 2) {
        setFormError('Укажите корректные имя и фамилию получателя.');
        haptic.error();
        return;
      }

      if (phoneDigits.length !== 10) {
        setFormError('Введите корректный номер телефона: +7 (XXX) XXX-XX-XX.');
        haptic.error();
        return;
      }

      if (!cleanCity || !cleanAddress) {
        setFormError('Укажите город и адрес ПВЗ СДЭК.');
        haptic.error();
        return;
      }
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
      customer: isPickupBlg
        ? {
            fullName: tgFullName || 'Самовывоз (Благовещенск)',
            phone: '',
            telegramUsername: tgUser.username ? `@${tgUser.username}` : '',
            telegramId: tgUser.id
          }
        : {
            fullName: cleanName,
            phone: phone.trim(),
            telegramUsername: telegramUsername.trim(),
            telegramId: tgUser.id
          },
      delivery: isPickupBlg
        ? {
            method: 'pickup_blg',
            city: 'Благовещенск',
            address: 'Забрать лично (обговор с владельцем)'
          }
        : {
            method: 'cdek_pvz',
            city: cleanCity,
            address: cleanAddress
          },
      paymentMethod: isPickupBlg ? 'manager' : paymentMethod,
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
        shipping: effectiveShipping,
        total: effectiveTotal,
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
                {orderComplete.delivery?.method === 'pickup_blg'
                  ? `Самовывоз в Благовещенске. Напишите владельцу (@${OWNER_HANDLE}) в Telegram, чтобы договориться о встрече и оплате.`
                  : hasPreOrderItems
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
                    </span>
                    {orderComplete.delivery?.method !== 'pickup_blg' &&
                      ` — ${orderComplete.delivery?.city}, ${orderComplete.delivery?.address}`}
                  </div>
                  <div>
                    Оплата:{' '}
                    <span className="text-white">
                      {orderComplete.delivery?.method === 'pickup_blg'
                        ? `Обговор с владельцем (@${OWNER_HANDLE})`
                        : getPaymentMethodLabel(orderComplete.paymentMethod)}
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
                    const contactHandle =
                      orderComplete.delivery?.method === 'pickup_blg'
                        ? OWNER_HANDLE
                        : supportHandle;
                    openTelegramLink(`https://t.me/${contactHandle}`);
                  }}
                  className="w-full py-3 rounded-full border border-[#333333] hover:border-white text-white text-xs font-medium tracking-wider uppercase transition-colors cursor-pointer"
                >
                  {orderComplete.delivery?.method === 'pickup_blg'
                    ? `Написать владельцу @${OWNER_HANDLE}`
                    : `Написать поддержке @${supportHandle}`}
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

              {/* Delivery / Pickup method */}
              <div className="space-y-3">
                <span className="text-[#888888] uppercase tracking-wider block font-medium">
                  Способ получения
                </span>

                <div className="grid grid-cols-2 gap-2">
                  {DELIVERY_METHODS.map((dm) => {
                    const active = deliveryMethod === dm.id;
                    return (
                      <button
                        key={dm.id}
                        type="button"
                        onClick={() => {
                          haptic.select();
                          setDeliveryMethod(dm.id);
                          setFormError('');
                        }}
                        className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                          active
                            ? 'border-white bg-[#141414] text-white'
                            : 'border-[#222222] text-[#777777] hover:border-[#444444]'
                        }`}
                      >
                        <div className="font-medium text-xs text-white">{dm.label}</div>
                        <div className="text-[10px] text-[#777777] mt-0.5">{dm.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {isPickupBlg ? (
                <div className="p-4 rounded-2xl bg-black border border-[#242424] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white">Самовывоз · Благовещенск</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-white text-black text-[10px] font-semibold">
                      Доставка 0 ₽
                    </span>
                  </div>
                  <p className="text-[11px] text-[#999999] leading-relaxed">
                    Никаких данных вводить не нужно. Вы можете сразу подтвердить заказ — время, место встречи и оплата обсуждаются лично с владельцем{' '}
                    <span className="text-white">@{OWNER_HANDLE}</span>.
                  </p>
                </div>
              ) : (
                <>
                  {/* Recipient */}
                  <div className="space-y-3 pt-2 border-t border-[#141414]">
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
                          inputMode="tel"
                          autoComplete="tel"
                          required
                          maxLength={PHONE_MAX_LENGTH}
                          value={phone}
                          onChange={handlePhoneChange}
                          onPaste={handlePhonePaste}
                          placeholder="+7 (999) 000-00-00"
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

                  {/* СДЭК address */}
                  <div className="space-y-3 pt-2 border-t border-[#141414]">
                    <span className="text-[#888888] uppercase tracking-wider block font-medium">
                      Адрес СДЭК
                    </span>

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
                </>
              )}

              {/* Comment */}
              <div>
                <label className="block text-[11px] text-[#666666] mb-1">
                  Комментарий к заказу (опционально)
                </label>
                <textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Пожелания по выкупу, размерам или встрече..."
                  className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none resize-none"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-full bg-white text-black hover:bg-[#dddddd] text-xs font-semibold tracking-wider uppercase transition-colors cursor-pointer disabled:opacity-50 shadow-md"
              >
                {isSubmitting ? 'Оформление...' : `Подтвердить заказ · ${formatPrice(effectiveTotal)}`}
              </button>

            </form>
          )}
        </div>

      </div>
    </div>
  );
}
