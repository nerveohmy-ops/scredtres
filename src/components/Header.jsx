import React from 'react';
import { Search, ShoppingBag, Heart } from 'lucide-react';
import logoImg from '../assets/logo.jpg';
import { haptic } from '../utils/telegram';

export default function Header({ 
  cartCount, 
  favoritesCount, 
  onOpenCart, 
  onOpenFavorites, 
  onToggleSearch, 
  searchOpen,
  onGoHome
}) {
  const handleLogoClick = () => {
    haptic.light();
    if (onGoHome) {
      onGoHome();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-black/95 backdrop-blur-md border-b border-[#141414]">
      <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between">
        
        {/* Brand identity - Click to go Home */}
        <div 
          onClick={handleLogoClick}
          className="flex items-center gap-3 cursor-pointer group select-none active:opacity-70 transition-opacity"
          role="button"
          tabIndex={0}
          aria-label="Перейти на главный экран"
        >
          <div className="w-9 h-9 rounded-full overflow-hidden bg-black border border-[#222222] p-0.5 flex items-center justify-center group-hover:border-white transition-colors duration-300">
            <img 
              src={logoImg} 
              alt="SCREDTRES" 
              className="w-full h-full object-cover grayscale contrast-125 rounded-full"
            />
          </div>
          <span className="text-base font-black tracking-[0.2em] text-white leading-none font-cinzel group-hover:text-[#eeeeee] transition-colors">
            SCREDTRES
          </span>
        </div>

        {/* Rounded Icon-Only Actions */}
        <div className="flex items-center gap-2">
          {/* Search Menu Toggle */}
          <button 
            onClick={() => {
              haptic.light();
              onToggleSearch();
            }}
            aria-label="Поиск и фильтры"
            className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors cursor-pointer ${
              searchOpen 
                ? 'bg-white text-black border-white' 
                : 'border-[#222222] text-[#888888] hover:text-white hover:border-white'
            }`}
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Favorites */}
          <button 
            onClick={() => {
              haptic.light();
              onOpenFavorites();
            }}
            aria-label="Избранное"
            className="relative w-9 h-9 rounded-full flex items-center justify-center border border-[#222222] text-[#888888] hover:text-white hover:border-white transition-colors cursor-pointer"
          >
            <Heart className="w-4 h-4" />
            {favoritesCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-white" />
            )}
          </button>

          {/* Cart - Icon Only (no text label) */}
          <button 
            onClick={() => {
              haptic.medium();
              onOpenCart();
            }}
            aria-label="Корзина"
            className="relative w-9 h-9 rounded-full bg-white text-black hover:bg-[#dddddd] transition-colors flex items-center justify-center cursor-pointer shadow-sm"
          >
            <ShoppingBag className="w-4 h-4" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-black text-white border border-white text-[9px] font-bold flex items-center justify-center leading-none">
                {cartCount}
              </span>
            )}
          </button>
        </div>

      </div>
    </header>
  );
}
