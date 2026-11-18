import React, { useState, useEffect, useRef } from 'react';
import { X, Heart, Plus, Minus, Check, Ruler, ImageOff, Plane, PackageCheck, ShoppingBag } from 'lucide-react';
import { haptic } from '../utils/telegram';
import { formatPrice } from '../utils/store';
import { CATEGORIES, DEFAULT_DELIVERY_DAYS } from '../data/products';

export default function ProductModal({ 
  product, 
  onClose, 
  onAddToCart, 
  isFavorite, 
  onToggleFavorite,
  supportUsername = 'dybriansik'
}) {
  const sizesList = product?.sizes && product.sizes.length > 0 ? product.sizes : ['ONE SIZE'];
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedSize, setSelectedSize] = useState(sizesList[0]);
  const [quantity, setQuantity] = useState(1);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [addedAnimation, setAddedAnimation] = useState(false);
  const [brokenImages, setBrokenImages] = useState({});
  const addTimerRef = useRef(null);

  useEffect(() => {
    if (!product) return;
    const nextSizes = product.sizes && product.sizes.length > 0 ? product.sizes : ['ONE SIZE'];
    setActiveImageIndex(0);
    setSelectedSize(nextSizes[0]);
    setQuantity(1);
    setShowSizeGuide(false);
    setAddedAnimation(false);
    setBrokenImages({});
  }, [product?.id]);

  useEffect(() => {
    return () => {
      if (addTimerRef.current) clearTimeout(addTimerRef.current);
    };
  }, []);

  if (!product) return null;

  const images = product.images || [];
  const currentImg = images[activeImageIndex];
  const isPreOrder = product.availability === 'pre_order';
  const categoryName = CATEGORIES.find((c) => c.id === product.category)?.name || product.category;
  const supportHandle = (supportUsername || 'dybriansik').replace(/^@/, '').trim() || 'dybriansik';

  const handleAddToCart = () => {
    haptic.medium();
    onAddToCart(product, selectedSize, quantity);
    setAddedAnimation(true);
    if (addTimerRef.current) clearTimeout(addTimerRef.current);
    addTimerRef.current = setTimeout(() => {
      setAddedAnimation(false);
      onClose();
    }, 450);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-[#080808] border border-[#1f1f1f] rounded-t-2xl sm:rounded-2xl z-10 max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        
        {/* Top Bar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#141414] bg-black">
          <span className="text-[11px] tracking-[0.15em] uppercase text-[#888888]">
            {categoryName}
          </span>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                haptic.light();
                onToggleFavorite(product.id);
              }}
              aria-label="В избранное"
              className="w-8 h-8 rounded-full border border-[#222222] flex items-center justify-center text-[#888888] hover:text-white hover:border-white transition-colors cursor-pointer"
            >
              <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-white text-white' : ''}`} />
            </button>
            <button
              onClick={() => {
                haptic.light();
                onClose();
              }}
              aria-label="Закрыть"
              className="w-8 h-8 rounded-full border border-[#222222] flex items-center justify-center text-[#888888] hover:text-white hover:border-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-6">
          
          {/* Main Visual */}
          <div className="space-y-2">
            <div className="relative aspect-[3/4] bg-black border border-[#141414] rounded-xl overflow-hidden flex items-center justify-center">
              {currentImg && !brokenImages[activeImageIndex] ? (
                <img
                  src={currentImg}
                  alt={product.name}
                  onError={() => setBrokenImages((prev) => ({ ...prev, [activeImageIndex]: true }))}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-[#444444] gap-2">
                  <ImageOff className="w-8 h-8" />
                  <span className="text-xs">Изображение отсутствует</span>
                </div>
              )}
            </div>

            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      haptic.select();
                      setActiveImageIndex(idx);
                    }}
                    className={`w-14 h-18 rounded-lg overflow-hidden border shrink-0 transition-all cursor-pointer ${
                      activeImageIndex === idx 
                        ? 'border-white opacity-100' 
                        : 'border-[#222222] opacity-40 hover:opacity-80'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Availability & Delivery Pill */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border ${
                isPreOrder
                  ? 'border-[#333333] bg-[#111111] text-[#cccccc]'
                  : 'border-white bg-white text-black font-medium'
              }`}
            >
              {isPreOrder ? <Plane className="w-3.5 h-3.5" /> : <PackageCheck className="w-3.5 h-3.5" />}
              <span>
                {isPreOrder
                  ? `Под заказ из Китая · ${product.deliveryDays || DEFAULT_DELIVERY_DAYS}`
                  : `В наличии · ${product.deliveryDays || 'отправка 1–3 дня'}`}
              </span>
            </span>
          </div>

          {/* Title & Price */}
          <div className="space-y-1.5 border-b border-[#141414] pb-4">
            {product.brand && (
              <div className="text-xs text-[#777777] uppercase tracking-wider">
                {product.brand}
              </div>
            )}
            <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">
              {product.name}
            </h2>

            <div className="flex items-baseline gap-3">
              <span className="text-xl sm:text-2xl font-bold text-white">
                {formatPrice(product.price)}
              </span>
              {product.oldPrice && Number(product.oldPrice) > Number(product.price) && (
                <span className="text-xs text-[#555555] line-through">
                  {formatPrice(product.oldPrice)}
                </span>
              )}
            </div>
          </div>

          {/* Size Choice */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#aaaaaa] uppercase tracking-wider">
                Размер
              </span>
              <button
                type="button"
                onClick={() => {
                  haptic.light();
                  setShowSizeGuide(!showSizeGuide);
                }}
                className="text-xs text-[#888888] hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Ruler className="w-3.5 h-3.5" />
                <span>Подобрать размер</span>
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {sizesList.map((size) => {
                const isSelected = selectedSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      haptic.select();
                      setSelectedSize(size);
                    }}
                    className={`py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-white text-black border-white shadow-sm'
                        : 'bg-black text-[#888888] border-[#222222] hover:border-[#444444] hover:text-white'
                    }`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>

            {showSizeGuide && (
              <div className="p-3.5 bg-black border border-[#1a1a1a] rounded-xl text-xs space-y-2 text-[#888888]">
                <div className="text-white font-medium pb-1 border-b border-[#1a1a1a]">
                  Справка по размерам (Китай / EU)
                </div>
                <p className="text-[11px] leading-relaxed">
                  Китайские и азиатские размеры могут маломерить на 0.5–1 размер. Если сомневаетесь в выборе — напишите владельцу <span className="text-white">@{supportHandle}</span>, сверим замеры по сетке Poizon перед выкупом.
                </p>
              </div>
            )}
          </div>

          {/* Quantity */}
          <div className="flex items-center justify-between border-y border-[#141414] py-3 text-xs">
            <span className="text-[#aaaaaa] uppercase tracking-wider">Количество</span>
            <div className="flex items-center gap-3 bg-black border border-[#222222] px-3 py-1.5 rounded-full">
              <button
                type="button"
                onClick={() => {
                  haptic.light();
                  setQuantity(Math.max(1, quantity - 1));
                }}
                disabled={quantity <= 1}
                className="text-[#888888] hover:text-white disabled:opacity-30 cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-6 text-center text-xs font-semibold text-white">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => {
                  haptic.light();
                  setQuantity(quantity + 1);
                }}
                className="text-[#888888] hover:text-white cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Details */}
          {(product.description || (product.details && product.details.length > 0)) && (
            <div className="space-y-2 text-xs">
              {product.description && (
                <p className="text-[#999999] leading-relaxed font-light whitespace-pre-line">
                  {product.description}
                </p>
              )}

              {product.details && product.details.length > 0 && (
                <ul className="space-y-1 pt-1 text-[#888888]">
                  {product.details.map((detail, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-[#444444]">—</span>
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

        </div>

        {/* Bottom Rounded Action: Add to Cart Only */}
        <div className="p-4 border-t border-[#141414] bg-black safe-pb">
          <button
            type="button"
            onClick={handleAddToCart}
            aria-label="Добавить в корзину"
            className={`w-full py-3.5 px-5 rounded-full text-xs font-semibold tracking-wider uppercase transition-all border cursor-pointer flex items-center justify-center gap-2 shadow-md ${
              addedAnimation
                ? 'bg-[#e5e5e5] text-black border-white'
                : 'bg-white text-black border-white hover:bg-[#dddddd]'
            }`}
          >
            {addedAnimation ? (
              <>
                <Check className="w-4 h-4 shrink-0" />
                <span>Добавлено в корзину</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span>В корзину · {formatPrice(product.price * quantity)}</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
