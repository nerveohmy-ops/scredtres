import React, { useState } from 'react';
import {
  User,
  Package,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Shield,
  Plus,
  ExternalLink
} from 'lucide-react';
import {
  ORDER_STATUSES,
  getDeliveryMethodLabel,
  getPaymentMethodLabel
} from '../data/products';
import { formatPrice } from '../utils/store';
import { getTelegramUser, haptic, openTelegramLink } from '../utils/telegram';
import { ROLES, getRoleLabel, isLocalDevEnvironment, canManageInfo } from '../utils/roles';

export default function ProfileView({
  role,
  orders = [],
  infoItems = [],
  settings = {},
  devRoleOverride = null,
  onChangeDevRole,
  onOpenAdminPanel
}) {
  const tgUser = getTelegramUser(devRoleOverride);
  const [openInfoId, setOpenInfoId] = useState(null);
  const isDevLocal = isLocalDevEnvironment();
  const isStaff = canManageInfo(role);
  const supportUsername = (settings?.supportUsername || 'dybriansik').replace(/^@/, '');

  const getOrderStatusLabel = (statusId) => {
    return ORDER_STATUSES.find((s) => s.id === statusId)?.name || 'Новый заказ';
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* User Identity Card */}
      <div className="p-5 bg-[#080808] border border-[#1a1a1a] rounded-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-black border border-[#222222] flex items-center justify-center shrink-0">
            <User className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">
                {tgUser.first_name} {tgUser.last_name || ''}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-[#141414] border border-[#262626] text-[10px] font-medium text-[#cccccc]">
                {getRoleLabel(role)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#777777] mt-0.5">
              <span>{tgUser.username ? `@${tgUser.username}` : 'Гость магазина'}</span>
              {Number(tgUser?.id) > 0 && (
                <span className="text-[11px] font-mono text-[#666666]">
                  · TG ID: {tgUser.id}
                </span>
              )}
            </div>
          </div>
        </div>

        {isStaff && (
          <button
            type="button"
            onClick={() => {
              haptic.light();
              onOpenAdminPanel?.();
            }}
            className="px-4 py-2 rounded-full bg-white text-black hover:bg-[#dddddd] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>{role === ROLES.ADMIN ? 'Админ-панель' : 'Панель поддержки'}</span>
          </button>
        )}
      </div>

      {/* My Orders */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-[#777777] uppercase tracking-wider flex items-center gap-2">
            <Package className="w-3.5 h-3.5" />
            <span>История заказов ({orders.length})</span>
          </h3>
        </div>

        {orders.length === 0 ? (
          <div className="p-6 text-center bg-[#080808] border border-[#161616] rounded-2xl text-xs text-[#777777]">
            У вас пока нет оформленных заказов.
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div
                key={order.orderId}
                className="p-4 bg-[#080808] border border-[#1a1a1a] rounded-xl space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-white">{order.orderId}</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#121212] border border-[#242424] text-[#cccccc] text-[11px]">
                    {getOrderStatusLabel(order.status)}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-[#999999]">
                  {(order.items || []).map((item, idx) => (
                    <div key={idx} className="flex justify-between gap-2">
                      <span className="truncate">
                        {item.name} ({item.size}) × {item.quantity}
                      </span>
                      <span className="text-white shrink-0">
                        {formatPrice(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                {(order.delivery?.city || order.delivery?.address || order.paymentMethod) && (
                  <div className="text-[11px] text-[#777777] space-y-0.5 pt-1">
                    {(order.delivery?.city || order.delivery?.address) && (
                      <div>
                        Доставка:{' '}
                        <span className="text-[#cccccc]">
                          {getDeliveryMethodLabel(order.delivery?.method)} — {order.delivery?.city},{' '}
                          {order.delivery?.address}
                        </span>
                      </div>
                    )}
                    {order.paymentMethod && (
                      <div>
                        Оплата:{' '}
                        <span className="text-[#cccccc]">
                          {getPaymentMethodLabel(order.paymentMethod)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {order.comment && (
                  <div className="p-2.5 bg-black border border-[#222222] rounded-lg space-y-0.5">
                    <div className="text-[10px] uppercase tracking-wider text-[#666666]">
                      Комментарий к заказу
                    </div>
                    <p className="text-xs text-[#e5e5e5] whitespace-pre-line break-words select-text">
                      {order.comment}
                    </p>
                  </div>
                )}

                {order.trackingNumber && (
                  <div className="text-[11px] text-[#aaaaaa] pt-1">
                    Трек-номер: <span className="text-white font-medium">{order.trackingNumber}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-[#141414] text-xs">
                  <span className="text-[#666666]">
                    {order.timestamp
                      ? new Date(order.timestamp).toLocaleDateString('ru-RU')
                      : ''}
                  </span>
                  <span className="font-bold text-white">
                    {formatPrice(order.pricing?.total)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Support Direct Link */}
      <button
        type="button"
        onClick={() => {
          haptic.medium();
          openTelegramLink(`https://t.me/${supportUsername}`);
        }}
        className="w-full p-4 bg-[#080808] border border-[#1a1a1a] hover:border-white rounded-2xl flex items-center justify-between text-xs text-[#aaaaaa] hover:text-white transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 text-left">
          <div className="w-9 h-9 rounded-full bg-[#111111] border border-[#222222] flex items-center justify-center shrink-0">
            <MessageCircle className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-white">Связаться с поддержкой</p>
            <p className="text-[11px] text-[#777777] mt-0.5">
              Помощь с выкупом из Китая, размерами и расчётом цены · @{supportUsername}
            </p>
          </div>
        </div>
        <ExternalLink className="w-4 h-4 text-[#777777] shrink-0" />
      </button>

      {/* Dynamic Info Blocks managed by Support & Owner (@dybriansik) */}
      {(infoItems.length > 0 || isStaff) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium text-[#777777] uppercase tracking-wider">
              Информация о выкупе и доставке
            </h3>
            {isStaff && (
              <button
                type="button"
                onClick={() => {
                  haptic.light();
                  onOpenAdminPanel?.();
                }}
                className="px-3 py-1 rounded-full border border-[#222222] hover:border-white text-[11px] text-[#aaaaaa] hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Редактировать</span>
              </button>
            )}
          </div>

          {infoItems.length === 0 ? (
            <div className="p-5 bg-[#080808] border border-[#161616] rounded-2xl text-xs text-[#777777] text-center space-y-2">
              <p>Информационные разделы пока не добавлены.</p>
              <button
                type="button"
                onClick={() => {
                  haptic.light();
                  onOpenAdminPanel?.();
                }}
                className="px-4 py-2 rounded-full bg-white text-black text-xs font-semibold cursor-pointer"
              >
                Добавить запись в панели
              </button>
            </div>
          ) : (
            <div className="border border-[#1a1a1a] rounded-2xl overflow-hidden divide-y divide-[#1a1a1a]">
              {infoItems.map((item) => {
                const isOpen = openInfoId === item.id;
                return (
                  <div key={item.id} className="bg-[#080808]">
                    <button
                      type="button"
                      onClick={() => {
                        haptic.light();
                        setOpenInfoId(isOpen ? null : item.id);
                      }}
                      className="w-full px-4 py-3.5 flex items-center justify-between text-left text-xs font-medium text-white cursor-pointer"
                    >
                      <span>{item.title}</span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-[#777777] shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#777777] shrink-0" />
                      )}
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 text-xs text-[#888888] leading-relaxed whitespace-pre-line">
                        {item.content}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Localhost-only Role Preview Switcher (hidden in Telegram / production) */}
      {isDevLocal && typeof onChangeDevRole === 'function' && (
        <section className="p-4 bg-[#050505] border border-dashed border-[#222222] rounded-2xl space-y-2.5">
          <div className="text-[11px] text-[#777777]">
            Локальный предпросмотр ролей (виден только на localhost)
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: null, label: 'Покупатель' },
              { id: ROLES.SUPPORT, label: 'Поддержка приложения' },
              { id: ROLES.ADMIN, label: '@dybriansik (Владелец)' }
            ].map((opt) => {
              const active = devRoleOverride === opt.id;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    haptic.select();
                    onChangeDevRole(opt.id);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors cursor-pointer ${
                    active
                      ? 'bg-white text-black border-white font-semibold'
                      : 'bg-black text-[#888888] border-[#222222] hover:border-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
