import React, { useState, useEffect, useRef } from 'react';
import { X, Check, AlertCircle, MapPin, Loader2 } from 'lucide-react';
import { getTelegramUser, submitOrderToServer, openTelegramLink, haptic } from '../utils/telegram';
import { fetchAddressSuggestions } from '../utils/api';
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

const OWNER_HANDLE = 'broknboyzclub';
const NAME_PART_RE = /^[a-zA-Zа-яА-ЯёЁ-]{2,40}$/;

export default function CheckoutModal({ 
  isOpen, 
  onClose, 
  orderSummary, 
  supportUsername = 'broknboyzclub',
  dbConfigured = false,
  isBrowserGuest = false,
  devRoleOverride,
  onOrderSuccess 
}) {
  const tgUser = getTelegramUser(devRoleOverride);
  const supportHandle = (supportUsername || 'broknboyzclub').replace(/^@/, '');

  const [lastName, setLastName] = useState(tgUser.last_name || '');
  const [firstName, setFirstName] = useState(tgUser.first_name || '');
  const [middleName, setMiddleName] = useState('');
  const [phone, setPhone] = useState('+7 ');
  const [telegramUsername, setTelegramUsername] = useState(
    tgUser.username ? `@${tgUser.username}` : ''
  );
  const [deliveryMethod, setDeliveryMethod] = useState('cdek_pvz');
  const [city, setCity] = useState('Москва');
  const [cityVerified, setCityVerified] = useState(true);
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);

  const [address, setAddress] = useState('');
  const [addressVerified, setAddressVerified] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState('sbp_card');
  const [comment, setComment] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderComplete, setOrderComplete] = useState(null);

  const cityTimerRef = useRef(null);
  const addrTimerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setOrderComplete(null);
      setFormError('');
      setCityOpen(false);
      setAddressOpen(false);
    }
  }, [isOpen]);

  // Debounced live city autocomplete
  useEffect(() => {
    if (!isOpen || deliveryMethod === 'pickup_blg' || cityVerified) {
      setCitySuggestions([]);
      setCityLoading(false);
      return;
    }
    const q = city.trim();
    if (q.length < 2) {
      setCitySuggestions([]);
      setCityLoading(false);
      return;
    }
    const controller = new AbortController();
    setCityLoading(true);
    cityTimerRef.current = setTimeout(async () => {
      const res = await fetchAddressSuggestions({ mode: 'city', q, signal: controller.signal });
      if (controller.signal.aborted) return;
      setCityLoading(false);
      if (res.ok) {
        setCitySuggestions(res.suggestions);
        setCityOpen(true);
      } else {
        setCitySuggestions([]);
      }
    }, 320);
    return () => {
      clearTimeout(cityTimerRef.current);
      controller.abort();
    };
  }, [city, cityVerified, deliveryMethod, isOpen]);

  // Debounced live address autocomplete scoped to selected city
  useEffect(() => {
    if (!isOpen || deliveryMethod === 'pickup_blg' || addressVerified) {
      setAddressSuggestions([]);
      setAddressLoading(false);
      return;
    }
    const q = address.trim();
    if (q.length < 3 || city.trim().length < 2) {
      setAddressSuggestions([]);
      setAddressLoading(false);
      return;
    }
    const controller = new AbortController();
    setAddressLoading(true);
    addrTimerRef.current = setTimeout(async () => {
      const res = await fetchAddressSuggestions({
        mode: 'address',
        q,
        city: city.trim(),
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      setAddressLoading(false);
      if (res.ok) {
        setAddressSuggestions(res.suggestions);
        setAddressOpen(true);
      } else {
        setAddressSuggestions([]);
      }
    }, 350);
    return () => {
      clearTimeout(addrTimerRef.current);
      controller.abort();
    };
  }, [address, addressVerified, city, deliveryMethod, isOpen]);

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
    const cleanLast = lastName.trim();
    const cleanFirst = firstName.trim();
    const cleanMiddle = middleName.trim();
    const cleanName = [cleanLast, cleanFirst, cleanMiddle].filter(Boolean).join(' ');
    const phoneDigits = getRuPhoneDigits(phone);
    let cleanCity = city.trim();
    let cleanAddress = address.trim();

    if (!isPickupBlg) {
      if (!NAME_PART_RE.test(cleanLast) || !NAME_PART_RE.test(cleanFirst) || !NAME_PART_RE.test(cleanMiddle)) {
        setFormError('Для СДЭК укажите полностью Фамилию, Имя и Отчество (только буквы).');
        haptic.error();
        return;
      }

      if (phoneDigits.length !== 10) {
        setFormError('Введите корректный номер телефона: +7 (XXX) XXX-XX-XX.');
        haptic.error();
        return;
      }

      if (cleanCity.length < 2 || !/[a-zа-яё]/i.test(cleanCity)) {
        setFormError('Укажите корректный город доставки.');
        haptic.error();
        return;
      }

      if (cleanAddress.length < 4 || !/[a-zа-яё]/i.test(cleanAddress) || !/\d/.test(cleanAddress)) {
        setFormError('Укажите полный адрес ПВЗ СДЭК (улица и номер дома).');
        haptic.error();
        return;
      }
    }

    setIsSubmitting(true);
    haptic.heavy();

    // Live verify city & address via /api/address if user typed manually without picking a suggestion
    if (!isPickupBlg && (!cityVerified || !addressVerified)) {
      if (!cityVerified) {
        const cityCheck = await fetchAddressSuggestions({ mode: 'city', q: cleanCity });
        if (cityCheck.ok) {
          if (cityCheck.suggestions.length === 0) {
            setIsSubmitting(false);
            setFormError('Город не найден. Выберите существующий город из подсказок.');
            haptic.error();
            return;
          }
          cleanCity = cityCheck.suggestions[0].value;
          setCity(cleanCity);
          setCityVerified(true);
        }
      }

      if (!addressVerified) {
        const addrCheck = await fetchAddressSuggestions({
          mode: 'address',
          q: cleanAddress,
          city: cleanCity
        });
        if (addrCheck.ok) {
          if (addrCheck.suggestions.length === 0) {
            setIsSubmitting(false);
            setFormError('Адрес не найден в этом городе. Выберите реальный адрес из списка подсказок.');
            haptic.error();
            return;
          }
          const matched = addrCheck.suggestions.find((s) => s.hasHouse) || addrCheck.suggestions[0];
          if (!matched.hasHouse && !/\d/.test(cleanAddress)) {
            setIsSubmitting(false);
            setFormError('Уточните номер дома и выберите адрес из подсказок.');
            haptic.error();
            return;
          }
          cleanAddress = matched.hasHouse ? matched.value : cleanAddress;
          setAddress(cleanAddress);
          setAddressVerified(true);
        }
      }
    }

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
        quantity: i.quantity,
        image: i.product.images?.[0] || ''
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
                    const msg = `Здравствуйте! По заказу ${orderComplete.orderId}`;
                    openTelegramLink(
                      `https://t.me/${contactHandle}?text=${encodeURIComponent(msg)}`
                    );
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
              
              {isBrowserGuest && (
                <div className="p-3 rounded-xl border border-[#333333] bg-[#111111] text-[#dddddd] flex items-start gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-white" />
                  <div className="space-y-1">
                    <p>
                      Вы открыли магазин в обычном браузере. Чтобы оформить заказ, запустите мини-приложение внутри Telegram-бота.
                    </p>
                    <button
                      type="button"
                      onClick={() => openTelegramLink(`https://t.me/${OWNER_HANDLE}`)}
                      className="text-white underline underline-offset-4 cursor-pointer"
                    >
                      Написать @{OWNER_HANDLE}
                    </button>
                  </div>
                </div>
              )}

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
                      Получатель (ФИО для СДЭК)
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-[#666666] mb-1">Фамилия *</label>
                        <input
                          type="text"
                          required
                          autoComplete="family-name"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Иванов"
                          className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-[#666666] mb-1">Имя *</label>
                        <input
                          type="text"
                          required
                          autoComplete="given-name"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Иван"
                          className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-[#666666] mb-1">Отчество *</label>
                        <input
                          type="text"
                          required
                          autoComplete="additional-name"
                          value={middleName}
                          onChange={(e) => setMiddleName(e.target.value)}
                          placeholder="Иванович"
                          className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  </div>

                  {/* СДЭК address with live autocomplete & verification */}
                  <div className="space-y-3 pt-2 border-t border-[#141414]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#888888] uppercase tracking-wider block font-medium">
                        Адрес СДЭК
                      </span>
                      {cityVerified && addressVerified && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-white bg-[#141414] border border-[#2a2a2a] px-2 py-0.5 rounded-full">
                          <Check className="w-3 h-3" />
                          <span>Адрес подтверждён</span>
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* City with live suggestions */}
                      <div className="relative">
                        <label className="flex items-center justify-between text-[11px] text-[#666666] mb-1">
                          <span>Город *</span>
                          {cityVerified && <Check className="w-3 h-3 text-white" />}
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            value={city}
                            onFocus={() => {
                              if (citySuggestions.length > 0) setCityOpen(true);
                            }}
                            onBlur={() => setTimeout(() => setCityOpen(false), 160)}
                            onChange={(e) => {
                              setCity(e.target.value);
                              setCityVerified(false);
                              setAddressVerified(false);
                            }}
                            placeholder="Москва"
                            className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none pr-8"
                          />
                          {cityLoading && (
                            <Loader2 className="w-3.5 h-3.5 text-[#777777] animate-spin absolute right-2.5 top-1/2 -translate-y-1/2" />
                          )}
                        </div>
                        {cityOpen && citySuggestions.length > 0 && (
                          <div className="absolute left-0 right-0 mt-1 z-30 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl overflow-hidden shadow-2xl max-h-44 overflow-y-auto">
                            {citySuggestions.map((s) => (
                              <button
                                key={s.label}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  haptic.select();
                                  setCity(s.value);
                                  setCityVerified(true);
                                  setAddressVerified(false);
                                  setCityOpen(false);
                                  setFormError('');
                                }}
                                className="w-full px-3 py-2 text-left text-[11px] text-[#dddddd] hover:bg-[#1a1a1a] hover:text-white flex items-center gap-2 border-b border-[#181818] last:border-b-0 cursor-pointer"
                              >
                                <MapPin className="w-3 h-3 text-[#777777] shrink-0" />
                                <span className="truncate">{s.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Street + house with live suggestions */}
                      <div className="sm:col-span-2 relative">
                        <label className="flex items-center justify-between text-[11px] text-[#666666] mb-1">
                          <span>Адрес ПВЗ СДЭК *</span>
                          {addressVerified && <Check className="w-3 h-3 text-white" />}
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            value={address}
                            onFocus={() => {
                              if (addressSuggestions.length > 0) setAddressOpen(true);
                            }}
                            onBlur={() => setTimeout(() => setAddressOpen(false), 160)}
                            onChange={(e) => {
                              setAddress(e.target.value);
                              setAddressVerified(false);
                            }}
                            placeholder="Начните вводить улицу и дом (ул. Тверская, 12)"
                            className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none pr-8"
                          />
                          {addressLoading && (
                            <Loader2 className="w-3.5 h-3.5 text-[#777777] animate-spin absolute right-2.5 top-1/2 -translate-y-1/2" />
                          )}
                        </div>
                        {addressOpen && addressSuggestions.length > 0 && (
                          <div className="absolute left-0 right-0 mt-1 z-30 bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl overflow-hidden shadow-2xl max-h-48 overflow-y-auto">
                            {addressSuggestions.map((s) => (
                              <button
                                key={s.label}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  haptic.select();
                                  setAddress(s.value);
                                  if (s.city) {
                                    setCity(s.city);
                                    setCityVerified(true);
                                  }
                                  setAddressVerified(Boolean(s.hasHouse));
                                  setAddressOpen(false);
                                  setFormError('');
                                }}
                                className="w-full px-3 py-2 text-left text-[11px] text-[#dddddd] hover:bg-[#1a1a1a] hover:text-white flex items-center gap-2 border-b border-[#181818] last:border-b-0 cursor-pointer"
                              >
                                <MapPin className="w-3 h-3 text-[#777777] shrink-0" />
                                <span className="truncate">{s.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] text-[#666666]">
                      Выберите город и адрес из выпадающих подсказок — система проверяет реальность адреса.
                    </p>
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
                  placeholder="Пожелания по заказу, размерам или встрече..."
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
