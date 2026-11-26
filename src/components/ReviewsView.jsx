import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ExternalLink,
  X,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Play,
  ArrowLeft,
  MessageSquareQuote,
  Camera,
  RefreshCw
} from 'lucide-react';
import { REVIEWS_CHANNEL_URL } from '../data/reviews';
import { haptic, openTelegramLink } from '../utils/telegram';
import { fetchLiveReviews } from '../utils/api';

function formatReviewDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function pluralizeRu(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} ${few}`;
  return `${count} ${many}`;
}

function getAuthorInitial(author) {
  const chars = Array.from((author || '').trim());
  return chars[0] || 'П';
}

function ReviewThumbnail({ src, alt, isVideoNote, videoDuration, onClick, className = '' }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#060606] border border-[#1a1a1a] text-[#444444] rounded-xl ${className}`}
      >
        <ImageOff className="w-5 h-5" />
        <span className="text-[10px] mt-1">Нет фото</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden bg-black border border-[#1a1a1a] hover:border-[#3a3a3a] rounded-xl cursor-zoom-in transition-colors block w-full ${className}`}
      aria-label={isVideoNote ? 'Открыть превью видеокружка' : `Открыть фото: ${alt}`}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-500 ease-out"
      />
      {isVideoNote && (
        <div className="absolute inset-0 bg-black/35 group-hover:bg-black/25 transition-colors flex flex-col items-center justify-center gap-1.5">
          <div className="w-11 h-11 rounded-full bg-white/95 text-black flex items-center justify-center shadow-lg">
            <Play className="w-4 h-4 fill-black ml-0.5" />
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-black/80 border border-[#333333] text-[10px] font-medium text-white">
            Видеокружок{videoDuration ? ` · ${videoDuration}` : ''}
          </span>
        </div>
      )}
    </button>
  );
}

export default function ReviewsView({ onGoToCatalog }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'with_photo'
  const [lightbox, setLightbox] = useState(null); // { review, index }
  const [liveReviews, setLiveReviews] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadReviews = useCallback(async (signal) => {
    setIsLoading(true);
    setLoadError(false);
    const res = await fetchLiveReviews(signal);
    if (signal?.aborted) return;
    if (res.ok && Array.isArray(res.reviews)) {
      setLiveReviews(res.reviews);
    } else {
      setLoadError(true);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadReviews(controller.signal);
    return () => controller.abort();
  }, [loadReviews]);

  const allReviews = liveReviews;

  const stats = useMemo(() => {
    const totalReviews = allReviews.length;
    const withPhotos = allReviews.filter((r) => Array.isArray(r.images) && r.images.length > 0).length;
    const totalPhotos = allReviews.reduce(
      (sum, r) => sum + (Array.isArray(r.images) ? r.images.length : 0),
      0
    );
    return { totalReviews, withPhotos, totalPhotos };
  }, [allReviews]);

  const filteredReviews = useMemo(() => {
    if (filter === 'with_photo') {
      return allReviews.filter((r) => Array.isArray(r.images) && r.images.length > 0);
    }
    return allReviews;
  }, [filter, allReviews]);

  const openLightbox = useCallback((review, index = 0) => {
    haptic.light();
    setLightbox({ review, index });
  }, []);

  const closeLightbox = useCallback(() => {
    haptic.light();
    setLightbox(null);
  }, []);

  const stepLightbox = useCallback((delta) => {
    setLightbox((prev) => {
      if (!prev) return null;
      const imgs = prev.review?.images || [];
      if (imgs.length <= 1) return prev;
      haptic.select();
      const nextIndex = (prev.index + delta + imgs.length) % imgs.length;
      return { ...prev, index: nextIndex };
    });
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') stepLightbox(-1);
      if (e.key === 'ArrowRight') stepLightbox(1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightbox, closeLightbox, stepLightbox]);

  const handleOpenTelegram = (url) => {
    haptic.medium();
    openTelegramLink(url);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#141414] pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[#777777]">
            <MessageSquareQuote className="w-3.5 h-3.5" />
            <span>Реальные покупатели</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black font-cinzel text-white uppercase tracking-wider">
            Отзывы
          </h2>
          <p className="text-xs text-[#777777]">
            {pluralizeRu(stats.totalReviews, 'отзыв', 'отзыва', 'отзывов')} ·{' '}
            {pluralizeRu(stats.totalPhotos, 'фото', 'фото', 'фото')} из{' '}
            <span className="text-[#aaaaaa]">@reviewscred</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => {
              haptic.light();
              loadReviews();
            }}
            className="px-3.5 py-2.5 rounded-full border border-[#222222] hover:border-white text-xs text-[#aaaaaa] hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Обновить отзывы"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Обновить</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenTelegram(REVIEWS_CHANNEL_URL)}
            className="px-5 py-2.5 rounded-full bg-white text-black hover:bg-[#dddddd] text-xs font-semibold tracking-wider uppercase flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
          >
            <span>Канал @reviewscred</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Quick Filters */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => {
            haptic.select();
            setFilter('all');
          }}
          className={`px-4 py-1.5 rounded-full text-xs border transition-all cursor-pointer shrink-0 ${
            filter === 'all'
              ? 'bg-white text-black font-semibold border-white'
              : 'bg-[#0a0a0a] text-[#888888] border-[#222222] hover:border-[#444444] hover:text-white'
          }`}
        >
          Все ({stats.totalReviews})
        </button>
        <button
          type="button"
          onClick={() => {
            haptic.select();
            setFilter('with_photo');
          }}
          className={`px-4 py-1.5 rounded-full text-xs border transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
            filter === 'with_photo'
              ? 'bg-white text-black font-semibold border-white'
              : 'bg-[#0a0a0a] text-[#888888] border-[#222222] hover:border-[#444444] hover:text-white'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>С фото ({stats.withPhotos})</span>
        </button>
      </div>

      {/* Reviews Grid */}
      {isLoading && allReviews.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-[#080808] border border-[#181818] rounded-2xl p-5 space-y-3 animate-pulse"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#151515]" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3 w-28 bg-[#181818] rounded" />
                  <div className="h-2.5 w-20 bg-[#121212] rounded" />
                </div>
              </div>
              <div className="h-3 w-full bg-[#141414] rounded" />
              <div className="h-3 w-3/4 bg-[#141414] rounded" />
            </div>
          ))}
        </div>
      ) : loadError && allReviews.length === 0 ? (
        <div className="py-12 px-4 text-center bg-[#080808] border border-[#161616] rounded-2xl space-y-3">
          <p className="text-xs text-[#999999]">
            Не удалось загрузить отзывы из канала @reviewscred.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                haptic.light();
                loadReviews();
              }}
              className="px-4 py-2 rounded-full bg-white text-black text-xs font-semibold cursor-pointer"
            >
              Повторить
            </button>
            <button
              type="button"
              onClick={() => handleOpenTelegram(REVIEWS_CHANNEL_URL)}
              className="px-4 py-2 rounded-full border border-[#2a2a2a] hover:border-white text-xs text-white cursor-pointer"
            >
              Открыть @reviewscred
            </button>
          </div>
        </div>
      ) : filteredReviews.length === 0 ? (
        <div className="py-16 text-center bg-[#080808] border border-[#161616] rounded-2xl text-xs text-[#777777]">
          {allReviews.length === 0
            ? 'Отзывы пока не загружены.'
            : 'Отзывы по выбранному фильтру отсутствуют.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {filteredReviews.map((review) => {
            const images = Array.isArray(review.images) ? review.images : [];
            const hasMultiMessages = Array.isArray(review.messages) && review.messages.length > 1;
            const formattedDate = formatReviewDate(review.date);

            return (
              <article
                key={review.id}
                className="bg-[#080808] border border-[#181818] hover:border-[#2a2a2a] rounded-2xl p-4 sm:p-5 space-y-3.5 transition-colors"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-black border border-[#222222] flex items-center justify-center text-xs font-semibold text-white shrink-0 select-none">
                      {getAuthorInitial(review.author)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate">
                        {review.author || 'Покупатель'}
                      </h3>
                      {formattedDate && (
                        <time
                          dateTime={review.date}
                          className="text-[11px] text-[#666666] block"
                        >
                          {formattedDate}
                        </time>
                      )}
                    </div>
                  </div>

                  {review.postUrl && (
                    <button
                      type="button"
                      onClick={() => handleOpenTelegram(review.postUrl)}
                      aria-label={`Открыть отзыв #${review.postId} в Telegram`}
                      className="px-2.5 py-1 rounded-full bg-black border border-[#1f1f1f] hover:border-[#444444] text-[10px] text-[#777777] hover:text-white flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                    >
                      <span>#{review.postId}</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Review Text */}
                {hasMultiMessages ? (
                  <div className="space-y-2">
                    {review.messages.map((part, idx) => (
                      <p
                        key={idx}
                        className="text-xs sm:text-[13px] text-[#dddddd] leading-relaxed whitespace-pre-line break-words select-text"
                      >
                        {part}
                      </p>
                    ))}
                  </div>
                ) : (
                  review.text && (
                    <p className="text-xs sm:text-[13px] text-[#dddddd] leading-relaxed whitespace-pre-line break-words select-text">
                      {review.text}
                    </p>
                  )
                )}

                {/* Photos / Media */}
                {images.length === 1 && (
                  <ReviewThumbnail
                    src={images[0]}
                    alt={`Отзыв от ${review.author}`}
                    isVideoNote={review.isVideoNote}
                    videoDuration={review.videoDuration}
                    onClick={() => openLightbox(review, 0)}
                    className="aspect-[4/3] max-h-80"
                  />
                )}

                {images.length === 2 && (
                  <div className="grid grid-cols-2 gap-2">
                    {images.map((img, idx) => (
                      <ReviewThumbnail
                        key={img}
                        src={img}
                        alt={`Отзыв от ${review.author} (${idx + 1})`}
                        onClick={() => openLightbox(review, idx)}
                        className="aspect-square"
                      />
                    ))}
                  </div>
                )}

                {images.length === 3 && (
                  <div className="grid grid-cols-2 gap-2">
                    {images.map((img, idx) => (
                      <ReviewThumbnail
                        key={img}
                        src={img}
                        alt={`Отзыв от ${review.author} (${idx + 1})`}
                        onClick={() => openLightbox(review, idx)}
                        className={idx === 0 ? 'col-span-2 aspect-[16/10]' : 'aspect-square'}
                      />
                    ))}
                  </div>
                )}

                {images.length >= 4 && (
                  <div className="grid grid-cols-2 gap-2">
                    {images.map((img, idx) => (
                      <ReviewThumbnail
                        key={img}
                        src={img}
                        alt={`Отзыв от ${review.author} (${idx + 1})`}
                        onClick={() => openLightbox(review, idx)}
                        className="aspect-square"
                      />
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Bottom Action */}
      <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3 border-t border-[#141414]">
        {typeof onGoToCatalog === 'function' && (
          <button
            type="button"
            onClick={() => {
              haptic.medium();
              onGoToCatalog();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="w-full sm:w-auto px-7 py-3 rounded-full bg-white text-black text-xs font-semibold uppercase tracking-wider hover:bg-[#dddddd] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Вернуться в каталог</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => handleOpenTelegram(REVIEWS_CHANNEL_URL)}
          className="w-full sm:w-auto px-6 py-3 rounded-full bg-[#0a0a0a] border border-[#222222] hover:border-white text-xs font-medium text-[#cccccc] hover:text-white uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Все отзывы в Telegram</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Fullscreen Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр фото отзыва"
          onClick={closeLightbox}
        >
          {/* Top Bar */}
          <div
            className="max-w-4xl w-full mx-auto flex items-center justify-between gap-3 py-1"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {lightbox.review.author}
              </p>
              <p className="text-[11px] text-[#777777]">
                {formatReviewDate(lightbox.review.date)}
                {lightbox.review.images.length > 1 &&
                  ` · ${lightbox.index + 1} / ${lightbox.review.images.length}`}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {lightbox.review.postUrl && (
                <button
                  type="button"
                  onClick={() => handleOpenTelegram(lightbox.review.postUrl)}
                  className="px-3 py-1.5 rounded-full bg-[#111111] border border-[#262626] hover:border-white text-[11px] text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <span>Пост #{lightbox.review.postId}</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={closeLightbox}
                aria-label="Закрыть просмотр"
                className="w-9 h-9 rounded-full bg-[#111111] border border-[#262626] hover:border-white text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Image Stage */}
          <div
            className="relative flex-1 flex items-center justify-center max-w-5xl w-full mx-auto my-2 min-h-0"
            onClick={(e) => e.stopPropagation()}
          >
            {lightbox.review.images.length > 1 && (
              <button
                type="button"
                onClick={() => stepLightbox(-1)}
                aria-label="Предыдущее фото"
                className="absolute left-1 sm:left-3 z-10 w-10 h-10 rounded-full bg-black/80 border border-[#2a2a2a] hover:border-white text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            <img
              src={lightbox.review.images[lightbox.index]}
              alt={`Отзыв от ${lightbox.review.author}`}
              className="max-w-full max-h-[72vh] object-contain rounded-xl border border-[#1a1a1a] bg-black"
            />

            {lightbox.review.images.length > 1 && (
              <button
                type="button"
                onClick={() => stepLightbox(1)}
                aria-label="Следующее фото"
                className="absolute right-1 sm:right-3 z-10 w-10 h-10 rounded-full bg-black/80 border border-[#2a2a2a] hover:border-white text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Bottom Caption / Video Link */}
          <div
            className="max-w-3xl w-full mx-auto text-center space-y-2.5 py-1"
            onClick={(e) => e.stopPropagation()}
          >
            {lightbox.review.text && (
              <p className="text-xs text-[#cccccc] leading-relaxed whitespace-pre-line max-h-24 overflow-y-auto px-2">
                {lightbox.review.text}
              </p>
            )}
            {lightbox.review.isVideoNote && lightbox.review.postUrl && (
              <button
                type="button"
                onClick={() => handleOpenTelegram(lightbox.review.postUrl)}
                className="px-5 py-2 rounded-full bg-white text-black hover:bg-[#dddddd] text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-black" />
                <span>Смотреть видеокружок в Telegram</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
