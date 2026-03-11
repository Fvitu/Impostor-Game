'use client';

import { useEffect } from 'react';
import '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { getSavedLanguage } from '@/lib/i18n';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();

  useEffect(() => {
    const savedLanguage = getSavedLanguage();

    if (savedLanguage !== i18n.language) {
      void i18n.changeLanguage(savedLanguage);
    }
  }, [i18n]);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    const handleChange = (lng: string) => {
      document.documentElement.lang = lng;
    };
    i18n.on('languageChanged', handleChange);
    return () => {
      i18n.off('languageChanged', handleChange);
    };
  }, [i18n]);

  return <>{children}</>;
}
