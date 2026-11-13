import React from 'react';
import { ArrowDown } from 'lucide-react';
import logoImg from '../assets/logo.jpg';
import { haptic } from '../utils/telegram';

export default function HeroBanner({ onExploreCatalog }) {
  return (
    <section className="relative overflow-hidden border-b border-[#141414] bg-black pt-10 pb-14 sm:pt-16 sm:pb-20">
      <div className="max-w-4xl mx-auto px-4 text-center flex flex-col items-center">
        
        {/* Core Iconic Artwork */}
        <div className="relative mb-6 group cursor-pointer" onClick={onExploreCatalog}>
          <div className="w-40 h-40 sm:w-52 sm:h-52 overflow-hidden bg-black border border-[#222222] p-1.5 rounded-2xl transition-all duration-700 group-hover:border-white">
            <img 
              src={logoImg} 
              alt="SCREDTRES" 
              className="w-full h-full object-cover grayscale contrast-150 brightness-95 rounded-xl group-hover:scale-105 transition-transform duration-700" 
            />
          </div>
        </div>

        {/* Brand Title */}
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white font-cinzel leading-none uppercase">
          SCREDTRES
        </h1>

        {/* Catalog Button Only */}
        <div className="pt-8 flex items-center justify-center">
          <button
            onClick={() => {
              haptic.medium();
              onExploreCatalog();
            }}
            className="px-7 py-3 rounded-full bg-white text-black text-xs font-semibold tracking-wider uppercase hover:bg-[#e0e0e0] transition-colors flex items-center gap-2 cursor-pointer shadow-md"
          >
            <span>В каталог</span>
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </section>
  );
}
