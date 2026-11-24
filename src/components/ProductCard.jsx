import React, { useState, useRef, useEffect } from 'react';
import { Heart, Check, ImageOff, ShoppingBag, Layers } from 'lucide-react';
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
  const addedTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    };
  }, []);

  const images = Array.isArray(product.images) ? product.images : [];
  const primaryImage = images.length > 0 ? images[0] : null;
  const isInStock = product.availability === 'in_stock';
  const sizes = Array.isArray(product.sizes) && product.sizes.length > 0 ? product.sizes : ['ONE SIZE'];
  const defaultSize = sizes[0];

  const priceNum = Number(product.price) || 0;
  const oldPriceNum = Number(product.oldPrice) || 0;
  const hasDiscount = oldPriceNum > priceNum && priceNum > 0;
  const discountPercent = hasDiscount
    ? Math.round(((oldPriceNum - priceNum) / oldPriceNum) * 100)
    : 0;

  const handleQuickAdd = (e) => {
    e.stopPropagation();
    haptic.medium();
    onQuickAddToCart(product, defaultSize);
    setJustAdded(true);
    if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
    addedTimerRef.current = setTimeout(() => setJustAdded(false), 1200);
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
      className="group flex flex-col rounded-2xl bg-[#090909] border border-[#1a1a1c] hover:border-[#38383d] overflow-hidden transition-all duration-300 cursor-pointer"
    >
      {/* Compact 1:1 Visual Cutout Stage */}
      <div className="relative aspect-square bg-[radial-gradient(circle_at_50%_45%,#242428_0%,#121214_72%,#09090b_100%)] overflow-hidden flex items-center justify-center">
        {primaryImage && !imgError ? (
          <img
            src={primaryImage}
            alt={product.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-contain p-2.5 sm:p-3 drop-shadow-[0_10px_18px_rgba(0,0,0,0.65)] group-hover:scale-[1.04] transition-transform duration-500 ease-out"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-[#3a3a3a] gap-1.5 p-3 text-center">
            <ImageOff className="w-5 h-5" />
            <span className="text-[10px] uppercase tracking-wider text-[#555555]">Нет фото</span>
          </div>
        )}

        {/* Availability & Discount Pills */}
        <div className="absolute top-2 left-2 flex items-center gap-1">
          <span
            className={`px-2 py-0.5 rounded-full text-[9px] font-medium backdrop-blur-md border ${
              isInStock
                ? 'bg-white/95 text-black border-white font-semibold'
                : 'bg-black/75 text-[#ececec] border-white/15'
            }`}
          >
            {isInStock ? 'В наличии' : 'Под заказ'}
          </span>
          {hasDiscount && discountPercent >= 1 && (
            <span className="px-1.5 py-0.5 rounded-full bg-black/80 backdrop-blur-md border border-white/15 text-[9px] font-semibold text-white">
              -{discountPercent}%
            </span>
          )}
        </div>

        {/* Wishlist Icon */}
        <button
          type="button"
          onClick={handleFavoriteClick}
          aria-label="В избранное"
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-md border border-white/15 flex items-center justify-center text-[#a3a3a3] hover:text-white hover:border-white transition-colors cursor-pointer"
        >
          <Heart
            className={`w-3.5 h-3.5 transition-colors ${
              isFavorite ? 'fill-white text-white' : ''
            }`}
          />
        </button>

        {/* Multi-photo Indicator */}
        {images.length > 1 && (
          <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-[9px] text-[#dddddd] inline-flex items-center gap-1">
            <Layers className="w-2.5 h-2.5" />
            <span>{images.length}</span>
          </span>
        )}
      </div>

      {/* Compact Info + Quick-Add Footer */}
      <div className="p-2.5 sm:p-3 flex-1 flex flex-col justify-between gap-2 bg-[#090909]">
        <h3 className="text-xs sm:text-[13px] font-medium text-white leading-[1.3] line-clamp-2 min-h-[2.6em] group-hover:text-[#e5e5e5] transition-colors">
          {product.name}
        </h3>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="min-w-0 flex flex-wrap items-baseline gap-1.5">
            <span className="text-[13px] sm:text-sm font-bold tracking-tight text-white">
              {formatPrice(priceNum)}
            </span>
            {hasDiscount && (
              <span className="text-[10px] text-[#5c5c5c] line-through">
                {formatPrice(oldPriceNum)}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleQuickAdd}
            aria-label="Добавить в корзину"
            className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center border transition-all cursor-pointer ${
              justAdded
                ? 'bg-white text-black border-white'
                : 'bg-[#141416] border-[#2a2a2e] text-white hover:bg-white hover:text-black hover:border-white'
            }`}
          >
            {justAdded ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <ShoppingBag className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
