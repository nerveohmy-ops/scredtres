import React from 'react';
import { Search, X, ArrowUpDown, RotateCcw } from 'lucide-react';
import { CATEGORIES, AVAILABILITY_OPTIONS } from '../data/products';
import { haptic } from '../utils/telegram';

export default function SearchBar({
  isOpen,
  onClose,
  searchQuery,
  onSearchChange,
  availabilityFilter,
  onAvailabilityChange,
  activeCategory,
  onSelectCategory,
  sortBy,
  onSortChange,
  minPrice,
  maxPrice,
  onMinPriceChange,
  onMaxPriceChange,
  onResetFilters,
  totalResults,
  onApplyAndScroll
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 pt-[65px] flex flex-col">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={() => {
          haptic.light();
          onClose();
        }}
      />

      {/* Slide-down Drawer Panel */}
      <div className="relative z-10 w-full bg-[#070707] border-b border-[#222222] shadow-2xl animate-[slideDown_0.2s_ease-out] max-h-[82dvh] overflow-y-auto safe-pb">
        <div className="max-w-4xl mx-auto px-4 py-5 space-y-5">

          {/* Header row */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-white">
              Поиск и фильтры
            </span>
            <button
              onClick={() => {
                haptic.light();
                onClose();
              }}
              aria-label="Закрыть поиск"
              className="w-8 h-8 rounded-full border border-[#222222] flex items-center justify-center text-[#888888] hover:text-white hover:border-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666666]" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Название, бренд (Rick Owens, Balenciaga, Nike...)"
              className="w-full bg-black border border-[#222222] focus:border-white text-white text-xs pl-10 pr-10 py-3 rounded-full outline-none placeholder-[#555555] transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  haptic.light();
                  onSearchChange('');
                }}
                aria-label="Очистить поиск"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#666666] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Availability: В наличии / Под заказ */}
          <div className="space-y-2">
            <span className="text-[11px] uppercase tracking-wider text-[#777777] block">
              Наличие
            </span>
            <div className="flex flex-wrap gap-2">
              {AVAILABILITY_OPTIONS.map((opt) => {
                const isActive = availabilityFilter === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      haptic.select();
                      onAvailabilityChange(opt.id);
                    }}
                    className={`px-4 py-2 rounded-full text-xs border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white text-black font-semibold border-white'
                        : 'bg-black text-[#888888] border-[#222222] hover:border-[#444444] hover:text-white'
                    }`}
                  >
                    {opt.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <span className="text-[11px] uppercase tracking-wider text-[#777777] block">
              Категория
            </span>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => {
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      haptic.select();
                      onSelectCategory(cat.id);
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white text-black font-semibold border-white'
                        : 'bg-black text-[#888888] border-[#222222] hover:border-[#444444] hover:text-white'
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Price Range & Sort */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-[#777777] block">
                Цена (₽)
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={minPrice}
                  onChange={(e) => onMinPriceChange(e.target.value)}
                  placeholder="От"
                  className="w-full bg-black border border-[#222222] focus:border-white text-white text-xs px-3.5 py-2 rounded-full outline-none placeholder-[#555555]"
                />
                <span className="text-[#555555] text-xs">—</span>
                <input
                  type="number"
                  min="0"
                  value={maxPrice}
                  onChange={(e) => onMaxPriceChange(e.target.value)}
                  placeholder="До"
                  className="w-full bg-black border border-[#222222] focus:border-white text-white text-xs px-3.5 py-2 rounded-full outline-none placeholder-[#555555]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] uppercase tracking-wider text-[#777777] block">
                Сортировка
              </span>
              <div className="flex items-center gap-2 border border-[#222222] bg-black px-3.5 py-2 rounded-full">
                <ArrowUpDown className="w-3.5 h-3.5 text-[#666666] shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => {
                    haptic.select();
                    onSortChange(e.target.value);
                  }}
                  className="w-full bg-black text-white text-xs outline-none cursor-pointer"
                >
                  <option value="newest">Сначала новые</option>
                  <option value="price-asc">Сначала дешевле</option>
                  <option value="price-desc">Сначала дороже</option>
                </select>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-3 border-t border-[#161616]">
            <button
              type="button"
              onClick={() => {
                haptic.light();
                onResetFilters();
              }}
              className="px-4 py-2.5 rounded-full border border-[#222222] text-[#aaaaaa] hover:text-white hover:border-white text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сбросить</span>
            </button>

            <button
              type="button"
              onClick={() => {
                haptic.medium();
                onApplyAndScroll();
              }}
              className="flex-1 py-2.5 rounded-full bg-white text-black hover:bg-[#dddddd] text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Показать товары ({totalResults})
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
