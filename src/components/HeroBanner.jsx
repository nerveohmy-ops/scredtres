import React from 'react';
import { ArrowDown } from 'lucide-react';
import logoImg from '../assets/logo.jpg';
import { haptic } from '../utils/telegram';

export default function HeroBanner({ onExploreCatalog }) {
  return (
    <section className="relative overflow-hidden border-b border-[#141414] bg-black min-h-[220px] sm:min-h-[290px] flex items-center justify-center">
      {/* Subtle full-bleed SCRED logo background watermark */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none absolute inset-0 flex items-center justify-center overflow-hidden"
      >
        <img
          src={logoImg}
          alt=""
          className="w-[320px] sm:w-[440px] max-w-none h-auto object-contain grayscale contrast-125 opacity-25 scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/25 to-black/85" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at center, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.85) 75%, #000000 100%)'
          }}
        />
      </div>

      {/* Catalog Button Only */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-12 sm:py-16 text-center flex flex-col items-center justify-center">
        <button
          type="button"
          onClick={() => {
            haptic.medium();
            onExploreCatalog();
          }}
          className="px-8 py-3.5 rounded-full bg-white text-black text-xs font-semibold tracking-wider uppercase hover:bg-[#e0e0e0] transition-colors flex items-center gap-2 cursor-pointer shadow-[0_8px_32px_rgba(0,0,0,0.9)]"
        >
          <span>В каталог</span>
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      </div>
    </section>
  );
}
