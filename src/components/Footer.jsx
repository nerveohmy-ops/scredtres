import React from 'react';
import logoImg from '../assets/logo.jpg';
import { haptic } from '../utils/telegram';
import SocialLinks from './SocialLinks';

export default function Footer({ onGoHome }) {
  const handleClick = () => {
    haptic.light();
    if (onGoHome) {
      onGoHome();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <footer className="border-t border-[#141414] bg-black pt-12 pb-24 px-4 text-center space-y-4">
      <div className="max-w-md mx-auto space-y-3">
        <div 
          onClick={handleClick}
          className="w-10 h-10 mx-auto overflow-hidden bg-black border border-[#222222] p-0.5 rounded-full cursor-pointer hover:border-white transition-colors"
        >
          <img src={logoImg} alt="SCRED" className="w-full h-full object-cover grayscale contrast-125 rounded-full" />
        </div>

        <div className="space-y-0.5 cursor-pointer" onClick={handleClick}>
          <h4 className="text-base font-cinzel font-black tracking-widest text-white">
            SCREDTRES
          </h4>
          <p className="text-[11px] text-[#777777]">
            Выкуп и доставка оригинальной одежды из Китая
          </p>
        </div>

        <div className="pt-2">
          <SocialLinks variant="pills" />
        </div>

        <div className="text-[10px] text-[#444444] pt-2">
          © 2026 SCREDTRES. Все права защищены.
        </div>
      </div>
    </footer>
  );
}
