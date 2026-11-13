import React, { useState } from 'react';
import { Heart, Plus, Check, ImageOff } from 'lucide-react';
import { haptic } from '../utils/telegram';
import { formatPrice } from '../utils/store';

export default function ProductCard({ 
  product, 
  onSelectProduct, 
  isFavorite, 
  onToggleFavorite, 
  onQuickAddToCart 
}) {
  const [justAdded, setJustAdded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const primaryImage = product.images && product.images.length > 0 ? product.images[0] : null;
  const isPreOrder = product.availability === 'pre_order';

  const handleQuickAdd = (e) => {
    e.stopPropagation();
    haptic.medium();
    const defaultSize = product.sizes && product.sizes.length > 0 ? product.sizes[0] : 'ONE SIZE';
    onQuickAddToCart(product, defaultSize);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1200);
  };

  const handleFavoriteClick = (e) => {
    e.stopPropagation();
    haptic.light();
    onToggleFavorite(product.id);
  };

  return (
    <article 
      onClick={() => {
        haptic.light();
        onSelectProduct(product);
      }}
      className="group flex flex-col justify-between cursor-pointer"
    >
      {/* Visual Product Display */}
      <div className="relative aspect-[3/4] bg-[#080808] overflow-hidden rounded-xl border border-[#161616] group-hover:border-[#333333] transition-colors duration-300 flex items-center justify-center">
        {primaryImage && !imgError ? (
          <img
            src={primaryImage}
            alt={product.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover grayscale contrast-125 brightness-95 group-hover:scale-102 transition-transform duration-700 ease-out"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-[#333333] gap-2 p-4 text-center">
            <ImageOff className="w-6 h-6" />
            <span className="text-[10px] uppercase tracking-wider text-[#555555]">Нет фото</span>
          </div>
        )}

        {/* Availability Pill */}
        <span
          className={`absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-[10px] font-medium backdrop-blur-sm border ${
            isPreOrder
              ? 'bg-black/80 text-[#cccccc] border-[#333333]'
              : 'bg-white/95 text-black border-white'
          }`}
        >
          {isPreOrder ? 'Под заказ' : 'В наличии'}
        </span>

        {/* Rounded Wishlist Icon */}
        <button
          onClick={handleFavoriteClick}
          aria-label="В избранное"
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/70 backdrop-blur-sm border border-[#222222] flex items-center justify-center text-[#888888] hover:text-white hover:border-white transition-colors cursor-pointer"
        >
          <Heart 
            className={`w-3.5 h-3.5 transition-colors ${
              isFavorite ? 'fill-white text-white' : ''
            }`} 
          />
        </button>

        {/* Rounded Quick Add Button */}
        <button
          onClick={handleQuickAdd}
          aria-label="Быстро добавить"
          className={`absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-sm border transition-all cursor-pointer ${
            justAdded 
              ? 'bg-white text-black border-white' 
              : 'bg-black/80 border-[#2a2a2a] text-white hover:border-white hover:bg-white hover:text-black shadow-lg'
          }`}
        >
          {justAdded ? (
            <Check className="w-4 h-4 text-black" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Info */}
      <div className="pt-3 pb-1 space-y-1">
        {product.brand && (
          <span className="text-[10px] uppercase tracking-wider text-[#666666] block truncate">
            {product.brand}
          </span>
        )}
        <h3 className="text-xs sm:text-sm font-medium text-white tracking-tight line-clamp-1 group-hover:text-[#dddddd] transition-colors">
          {product.name}
        </h3>

        <div className="flex items-baseline gap-2">
          <span className="text-xs sm:text-sm font-semibold text-white">
            {formatPrice(product.price)}
          </span>
          {product.oldPrice && Number(product.oldPrice) > Number(product.price) && (
            <span className="text-[11px] text-[#555555] line-through">
              {formatPrice(product.oldPrice)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
