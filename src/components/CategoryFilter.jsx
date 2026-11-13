import React from 'react';
import { CATEGORIES, AVAILABILITY_OPTIONS } from '../data/products';
import { haptic } from '../utils/telegram';

export default function CategoryFilter({
  activeCategory,
  onSelectCategory,
  availabilityFilter,
  onAvailabilityChange
}) {
  return (
    <div className="border-b border-[#141414] bg-black">
      {/* Category Pills */}
      <nav className="w-full overflow-x-auto no-scrollbar border-b border-[#111111]">
        <div className="max-w-6xl mx-auto px-4 flex items-center gap-2 min-w-max py-3 text-xs tracking-wider uppercase">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => {
                  haptic.select();
                  onSelectCategory(cat.id);
                }}
                className={`px-4 py-2 rounded-full border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white text-black font-semibold border-white shadow-sm'
                    : 'bg-[#0a0a0a] text-[#888888] border-[#222222] hover:border-[#444444] hover:text-white'
                }`}
              >
                <span>{cat.name}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Availability Quick Filter: Все / В наличии / Под заказ */}
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-[10px] uppercase tracking-wider text-[#666666] mr-1 shrink-0">
          Статус:
        </span>
        {AVAILABILITY_OPTIONS.map((opt) => {
          const isActive = availabilityFilter === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => {
                haptic.select();
                onAvailabilityChange(opt.id);
              }}
              className={`px-3.5 py-1 rounded-full text-[11px] border transition-all shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-white text-black font-medium border-white'
                  : 'bg-black text-[#888888] border-[#1f1f1f] hover:border-[#444444] hover:text-white'
              }`}
            >
              {opt.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
