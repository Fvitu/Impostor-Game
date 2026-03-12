'use client';

import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';
import type { SupportedLanguage } from '@/lib/i18n';
import { SUPPORTED_LANGUAGES } from '@/lib/i18n';

export function useLanguage() {
  const { i18n } = useTranslation();

  const currentLanguage = i18n.language as SupportedLanguage;

  const setLanguage = useCallback(
    (lang: SupportedLanguage) => {
      i18n.changeLanguage(lang);
      try {
			localStorage.setItem("impostor_language", lang);
			// also set a cookie as a fallback for environments where localStorage
			// is not writable (e.g. some private browsing modes on mobile)
			try {
				document.cookie = `impostor_language=${lang}; path=/; max-age=${60 * 60 * 24 * 365}`;
			} catch {}
		} catch {
        // localStorage may be unavailable
        try {
			document.cookie = `impostor_language=${lang}; path=/; max-age=${60 * 60 * 24 * 365}`;
		} catch {}
      }
      document.documentElement.lang = lang;
    },
    [i18n]
  );

  const toggleLanguage = useCallback(() => {
    const next = currentLanguage === 'en' ? 'es' : 'en';
    setLanguage(next);
  }, [currentLanguage, setLanguage]);

  return {
    language: currentLanguage,
    setLanguage,
    toggleLanguage,
    supportedLanguages: SUPPORTED_LANGUAGES,
  };
}
