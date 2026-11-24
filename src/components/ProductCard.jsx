import React, { useState, useRef, useEffect } from 'react';
import { Heart, Check, ImageOff, ShoppingBag, Layers } from 'lucide-react';
import { haptic } from '../utils/telegram';
import { formatPrice } from '../utils/store';
import { CATEGORIES, DEFAULT_DELIVERY_DAYS } from '../data/products';

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
  const isPreOrder = product.availability === 'pre_order';
  const sizes = Array.isArray(product.sizes) && product.sizes.length > 0 ? product.sizes : ['ONE SIZE'];
  const defaultSize = sizes[0];
  const deliveryLabel = product.deliveryDays || (isPreOrder ? DEFAULT_DELIVERY_DAYS : '1–3 дня');
  const categoryName = CATEGORIES.find((c) => c.id === product.category)?.name || 'Каталог';

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
    addedTimerRef.current = setTimeout(() => setJustAdded(false), 1400);
  };

  const handleFavoriteClick = (e) => {
    e.stopPropagation();
    haptic.light();
    onToggleFavorite(product.id);
  };

  const sizePreview =
    sizes.length > 4
      ? `${sizes.slice(0, 4).join(' · ')} +${sizes.length - 4}`
      : sizes.join(' · ');

  return (
    <article
      onClick={() => {
        haptic.light();
        onSelectProduct(product);
      }}
      className="group flex flex-col rounded-2xl bg-[#090909] border border-[#1b1b1b] hover:border-[#383838] overflow-hidden transition-all duration-300 cursor-pointer shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
    >
      {/* Visual Product Display (transparent cutouts over studio slate backdrop) */}
      <div className="relative aspect-[4/5] bg-[radial-gradient(circle_at_50%_45%,#242428_0%,#121214_70%,#0a0a0c_100%)] overflow-hidden flex items-center justify-center">
        {primaryImage && !imgError ? (
          <img
            src={primaryImage}
            alt={product.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-contain p-3 sm:p-4 drop-shadow-[0_12px_20px_rgba(0,0,0,0.65)] group-hover:scale-[1.04] transition-transform duration-500 ease-out"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-[#3a3a3a] gap-2 p-4 text-center">
            <ImageOff className="w-6 h-6" />
            <span className="text-[10px] uppercase tracking-wider text-[#555555]">Нет фото</span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />

        {/* Availability Pill */}
        <span
          className={`absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-[10px] font-medium backdrop-blur-md border ${
            isPreOrder
              ? 'bg-black/75 text-[#ececec] border-white/15'
              : 'bg-white/95 text-black border-white font-semibold'
          }`}
        >
          {isPreOrder ? 'Под заказ' : 'В наличии'}
        </span>

        {/* Wishlist Icon */}
        <button
          type="button"
          onClick={handleFavoriteClick}
          aria-label="В избранное"
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/65 backdrop-blur-md border border-white/15 flex items-center justify-center text-[#a3a3a3] hover:text-white hover:border-white transition-colors cursor-pointer"
        >
          <Heart
            className={`w-3.5 h-3.5 transition-colors ${
              isFavorite ? 'fill-white text-white' : ''
            }`}
          />
        </button>

        {/* Multi-photo Indicator */}
        {images.length > 1 && (
          <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md border border-white/15 text-[10px] text-[#dddddd] inline-flex items-center gap-1">
            <Layers className="w-2.5 h-2.5" />
            <span>{images.length}</span>
          </span>
        )}
      </div>

      {/* Info & Action Footer */}
      <div className="p-3 sm:p-3.5 flex-1 flex flex-col justify-between gap-2.5 bg-[#090909]">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span className="uppercase tracking-[0.12em] text-[#7c7c7c] truncate">
              {product.brand || categoryName}
            </span>
            <span className="text-[#666666] shrink-0">{deliveryLabel}</span>
          </div>

          <h3 className="text-[13px] sm:text-sm font-medium text-white leading-[1.32] line-clamp-2 min-h-[2.64em] group-hover:text-[#e5e5e5] transition-colors">
            {product.name}
          </h3>

          <div className="text-[10px] text-[#6d6d6d] truncate pt-0.5">
            {sizePreview}
          </div>
        </div>

        <div className="space-y-2 pt-1 border-t border-[#151515]">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-sm sm:text-[15px] font-bold tracking-tight text-white">
              {formatPrice(priceNum)}
            </span>
            {hasDiscount && (
              <>
                <span className="text-[11px] text-[#555555] line-through">
                  {formatPrice(oldPriceNum)}
                </span>
                {discountPercent >= 1 && (
                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-semibold text-[#e5e5e5]">
                    -{discountPercent}%
                  </span>
                )}
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleQuickAdd}
            aria-label="Добавить в корзину"
            className={`w-full py-2 px-3 rounded-xl text-[11px] font-semibold uppercase tracking-wider flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
              justAdded
                ? 'bg-white text-black border-white'
                : 'bg-[#131313] border-[#262626] text-white hover:bg-white hover:text-black hover:border-white'
            }`}
          >
            {justAdded ? (
              <>
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>Добавлено</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                <span>В корзину</span>
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
