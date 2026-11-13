import React from 'react';
import { LayoutGrid, Heart, ShoppingBag, User, Shield, MessageSquareText } from 'lucide-react';
import { haptic } from '../utils/telegram';
import { ROLES } from '../utils/roles';

export default function BottomNav({
  activeTab,
  onSelectTab,
  cartCount,
  favoritesCount,
  role = ROLES.USER
}) {
  const isStaff = role === ROLES.ADMIN || role === ROLES.SUPPORT;

  const tabs = [
    { id: 'catalog', label: 'Каталог', icon: LayoutGrid },
    { id: 'favorites', label: 'Избранное', icon: Heart, hasBadge: favoritesCount > 0 },
    { id: 'cart', label: 'Корзина', icon: ShoppingBag, badgeText: cartCount > 0 ? `${cartCount}` : null },
    { id: 'reviews', label: 'Отзывы', icon: MessageSquareText },
    { id: 'profile', label: 'Профиль', icon: User },
    ...(isStaff ? [{ id: 'admin', label: role === ROLES.ADMIN ? 'Админ' : 'Панель', icon: Shield }] : [])
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-md border-t border-[#141414] safe-pb">
      <div className="max-w-lg mx-auto flex items-center justify-around py-2 sm:py-2.5 px-1 sm:px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => {
                haptic.select();
                onSelectTab(tab.id);
              }}
              className={`relative flex flex-col items-center justify-center flex-1 min-w-0 px-0.5 py-0.5 transition-colors cursor-pointer ${
                isActive ? 'text-white' : 'text-[#666666] hover:text-[#999999]'
              }`}
            >
              <div className="relative">
                <Icon className="w-4 h-4 shrink-0" />
                {tab.hasBadge && (
                  <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-white rounded-full"></span>
                )}
                {tab.badgeText && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[14px] h-[14px] bg-white text-black text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                    {tab.badgeText}
                  </span>
                )}
              </div>
              <span className={`text-[9px] sm:text-[10px] mt-1 tracking-tighter sm:tracking-tight leading-none whitespace-nowrap ${
                isActive ? 'font-medium text-white' : 'text-[#666666]'
              }`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
