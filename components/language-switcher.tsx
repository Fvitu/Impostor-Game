'use client';

import { useLanguage } from '@/hooks/use-language';

export function LanguageSwitcher() {
  const { language, toggleLanguage } = useLanguage();
  const Flag = () => {
    if (language === 'es') {
      return (
        <svg viewBox="0 0 900 600" xmlns="http://www.w3.org/2000/svg" className="h-full w-full block pointer-events-none transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <rect width="900" height="600" fill="#C60B1E" />
          <rect y="150" width="900" height="300" fill="#FFC400" />
        </svg>
      );
    }

    // default: en (United States simplified)
    return (
      <svg viewBox="0 0 19 10" xmlns="http://www.w3.org/2000/svg" className="h-full w-full block pointer-events-none transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <rect width="19" height="10" fill="#B22234" />
        {/* 7 white stripes (simplified) */}
        <rect y="1.4286" width="19" height="1.4286" fill="#FFFFFF" />
        <rect y="4.2858" width="19" height="1.4286" fill="#FFFFFF" />
        <rect y="7.1424" width="19" height="1.4286" fill="#FFFFFF" />
        {/* canton */}
        <rect width="7.6" height="4.2858" fill="#3C3B6E" />
        {/* a few stars */}
        <g fill="#FFFFFF">
          <circle cx="1" cy="1" r="0.25" />
          <circle cx="2" cy="1.5" r="0.25" />
          <circle cx="3" cy="0.8" r="0.25" />
          <circle cx="1.6" cy="2.6" r="0.25" />
          <circle cx="3.2" cy="2.2" r="0.25" />
        </g>
      </svg>
    );
  };

  return (
    <button
      onClick={toggleLanguage}
      // group so children can respond to hover; overflow-hidden so flag is clipped to circle
      className="z-50 h-10 w-10 rounded-full border border-border transition-all duration-200 ease-out shadow-lg shadow-black/20 cursor-pointer overflow-hidden p-0 group bg-secondary hover:shadow-2xl hover:scale-105 active:scale-95"
      style={{ position: 'fixed', right: '1.5rem', bottom: '1.5rem' }}
      aria-label={`Switch language (current: ${language})`}
    >
      <Flag />
      {/* subtle dark overlay that animates on hover/active without blocking events */}
      <span className="absolute inset-0 bg-black/0 pointer-events-none transition-colors duration-200 group-hover:bg-black/15 group-active:bg-black/20" aria-hidden />
    </button>
  );
}
