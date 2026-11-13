import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { getTelegramUser, submitOrderToServer, openTelegramLink, haptic } from '../utils/telegram';
import { formatPrice } from '../utils/store';

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
        method: deliveryMethod,
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
                  ? `В заказе есть позиции под заказ из Китая. Поддержка (@${supportHandle}) свяжется с вами для подтверждения выкупа и расчёта сроков доставки.`
                  : `Поддержка (@${supportHandle}) свяжется с вами в Telegram для подтверждения заказа и отправки трек-номера СДЭК.`}
              </p>

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

              {/* Delivery method */}
              <div className="space-y-3 pt-2 border-t border-[#141414]">
                <span className="text-[#888888] uppercase tracking-wider block font-medium">
                  Доставка
                </span>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      haptic.select();
                      setDeliveryMethod('cdek_pvz');
                    }}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      deliveryMethod === 'cdek_pvz'
                        ? 'border-white bg-[#141414] text-white'
                        : 'border-[#222222] text-[#666666] hover:border-[#444444]'
                    }`}
                  >
                    <div className="font-medium text-xs">СДЭК ПВЗ</div>
                    <div className="text-[10px] text-[#777777]">По РФ и СНГ</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      haptic.select();
                      setDeliveryMethod('cdek_courier');
                    }}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      deliveryMethod === 'cdek_courier'
                        ? 'border-white bg-[#141414] text-white'
                        : 'border-[#222222] text-[#666666] hover:border-[#444444]'
                    }`}
                  >
                    <div className="font-medium text-xs">Курьер</div>
                    <div className="text-[10px] text-[#777777]">До двери</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      haptic.select();
                      setDeliveryMethod('post_ru');
                    }}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      deliveryMethod === 'post_ru'
                        ? 'border-white bg-[#141414] text-white'
                        : 'border-[#222222] text-[#666666] hover:border-[#444444]'
                    }`}
                  >
                    <div className="font-medium text-xs">Почта</div>
                    <div className="text-[10px] text-[#777777]">По всему миру</div>
                  </button>
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
                      {deliveryMethod === 'cdek_pvz' ? 'Адрес ПВЗ СДЭК *' : 'Улица, дом, квартира *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder={deliveryMethod === 'cdek_pvz' ? 'ул. Тверская, 12' : 'ул. Ленина, д. 5, кв. 10'}
                      className="w-full bg-black border border-[#222222] focus:border-white text-white px-3.5 py-2.5 rounded-xl outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Payment choice */}
              <div className="space-y-3 pt-2 border-t border-[#141414]">
                <span className="text-[#888888] uppercase tracking-wider block font-medium">
                  Оплата
                </span>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'sbp_card', label: 'СБП / Карта РФ' },
                    { id: 'crypto', label: 'USDT (TRC-20)' },
                    { id: 'stars', label: 'Telegram Stars ⭐' },
                    { id: 'manager', label: 'Через менеджера' }
                  ].map((p) => (
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
