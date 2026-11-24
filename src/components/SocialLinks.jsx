import React from 'react';
import { ExternalLink } from 'lucide-react';
import { haptic, openExternalLink } from '../utils/telegram';

const TelegramIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M21.94 4.66a1.1 1.1 0 0 0-1.15-.19L2.88 11.46a.95.95 0 0 0 .06 1.79l4.46 1.47 1.72 5.38a.8.8 0 0 0 1.33.34l2.44-2.46 4.74 3.49a1.05 1.05 0 0 0 1.65-.63l3.01-14.78a1.1 1.1 0 0 0-.35-1.4ZM9.36 14.37l8.39-5.32-5.64 6.62-.34 2.86-1.44-4.16-3.71-1.22 11.96-4.7-9.22 5.92Z" />
  </svg>
);

const VkIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M13.16 17.5c-5.47 0-8.59-3.75-8.72-10h2.74c.09 4.59 2.11 6.53 3.71 6.93V7.5h2.58v3.96c1.58-.17 3.24-1.97 3.8-3.96h2.58c-.43 2.45-2.23 4.25-3.51 4.99 1.28.6 3.33 2.17 4.11 5.01h-2.84c-.61-1.9-2.13-3.37-4.14-3.57V17.5h-.31Z" />
  </svg>
);

const AvitoIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <circle cx="8" cy="15.5" r="4.5" />
    <circle cx="16.5" cy="8" r="3.4" />
    <circle cx="9.2" cy="7" r="2.2" />
    <circle cx="16.8" cy="16.2" r="2.5" />
  </svg>
);

const TikTokIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
    <path d="M16.75 4.2c.68 1.54 1.98 2.66 3.55 2.97v3.04a7.17 7.17 0 0 1-3.55-1.08v5.57a5.4 5.4 0 1 1-4.65-5.35v3.08a2.35 2.35 0 1 0 1.63 2.24V4.2h3.02Z" />
  </svg>
);

export const SOCIAL_LINKS = [
  {
    id: 'telegram',
    label: 'Telegram',
    handle: '@scredtres',
    url: 'https://t.me/scredtres',
    Icon: TelegramIcon
  },
  {
    id: 'avito',
    label: 'Авито',
    handle: 'Магазин и отзывы',
    url: 'https://www.avito.ru/brands/98fabf9be6ee34df5fba648fb13c3a2b',
    Icon: AvitoIcon
  },
  {
    id: 'vk',
    label: 'ВКонтакте',
    handle: 'vk.ru/scredtresshop',
    url: 'https://vk.ru/scredtresshop',
    Icon: VkIcon
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    handle: '@scredtres',
    url: 'https://www.tiktok.com/@scredtres',
    Icon: TikTokIcon
  }
];

export default function SocialLinks({ variant = 'pills' }) {
  const handleOpen = (url) => {
    haptic.light();
    openExternalLink(url);
  };

  if (variant === 'grid') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {SOCIAL_LINKS.map(({ id, label, handle, url, Icon }) => (
          <a
            key={id}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault();
              handleOpen(url);
            }}
            className="p-3.5 bg-[#080808] border border-[#1a1a1a] hover:border-white rounded-2xl flex items-center justify-between gap-3 text-xs text-[#aaaaaa] hover:text-white transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#111111] border border-[#222222] flex items-center justify-center shrink-0 text-white">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white truncate">{label}</p>
                <p className="text-[11px] text-[#777777] truncate mt-0.5">{handle}</p>
              </div>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-[#666666] shrink-0" />
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {SOCIAL_LINKS.map(({ id, label, url, Icon }) => (
        <a
          key={id}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            handleOpen(url);
          }}
          className="px-3.5 py-1.5 rounded-full bg-[#080808] border border-[#1c1c1c] hover:border-white text-[11px] font-medium text-[#b5b5b5] hover:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Icon className="w-3.5 h-3.5 text-white shrink-0" />
          <span>{label}</span>
        </a>
      ))}
    </div>
  );
}
