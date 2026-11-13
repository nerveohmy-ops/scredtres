import React, { useState } from 'react';
import { Heart, ShoppingBag, Trash2, ImageOff } from 'lucide-react';
import { haptic } from '../utils/telegram';

function FavoriteProductImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#060606] text-[#444444]">
        <ImageOff className="w-6 h-6" />
        <span className="text-[10px] mt-1.5">Нет фото</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-700"
    />
  );
}

export default function FavoritesView({
  favoriteIds,
  products,
  onSelectProduct,
  onToggleFavorite,
  onAddToCart,
  onGoToCatalog
}) {
  const favoriteProducts = products.filter(p => favoriteIds.includes(p.id));

  const formatPrice = (val) => {
    return new Intl.NumberFormat('ru-RU').format(val) + ' ₽';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between border-b border-[#141414] pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black font-cinzel text-white uppercase tracking-wider">
            Избранное
          </h2>
          <span className="text-xs text-[#666666]">
            Сохраненные позиции: {favoriteProducts.length}
          </span>
        </div>
      </div>

      {favoriteProducts.length === 0 ? (
        <div className="py-20 text-center space-y-4 max-w-xs mx-auto">
          <Heart className="w-8 h-8 text-[#444444] mx-auto" />
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Список пуст
            </h3>
            <p className="text-xs text-[#777777] font-light">
              Нажмите значок сердца на понравившихся вещах в каталоге.
            </p>
          </div>
          <button
            onClick={() => {
              haptic.medium();
              onGoToCatalog();
            }}
            className="px-6 py-3 rounded-full bg-white text-black text-xs font-semibold uppercase tracking-wider hover:bg-[#dddddd] transition-colors cursor-pointer shadow-md"
          >
            В каталог
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {favoriteProducts.map((product) => (
            <div
              key={product.id}
              onClick={() => {
                haptic.light();
                onSelectProduct(product);
              }}
              className="group flex flex-col justify-between cursor-pointer"
            >
              <div className="relative aspect-[3/4] bg-[#080808] border border-[#161616] rounded-xl overflow-hidden">
                <FavoriteProductImage src={product.images?.[0]} alt={product.name} />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    haptic.light();
                    onToggleFavorite(product.id);
                  }}
                  className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/70 backdrop-blur-sm border border-[#222222] flex items-center justify-center text-[#888888] hover:text-white transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="pt-2.5 pb-1 space-y-1">
                <h4 className="text-xs font-medium text-white line-clamp-1">
                  {product.name}
                </h4>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">
                    {formatPrice(product.price)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      haptic.medium();
                      onAddToCart(product, product.sizes?.[0] || 'ONE SIZE', 1);
                    }}
                    className="w-8 h-8 rounded-full border border-[#222222] hover:border-white hover:bg-white hover:text-black flex items-center justify-center text-[#888888] transition-colors"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
