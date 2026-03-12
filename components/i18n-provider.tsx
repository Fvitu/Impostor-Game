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

		// set document title and apple web app title to the translated site title
		try {
			const title = i18n.t("siteTitle");
			if (title) document.title = title;
			const appleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
			if (appleMeta) appleMeta.setAttribute("content", title || "The Impostor");
		} catch (e) {
			// ignore
		}

		const handleChange = (lng: string) => {
			document.documentElement.lang = lng;
			try {
				const title = i18n.t("siteTitle");
				if (title) document.title = title;
				const appleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
				if (appleMeta) appleMeta.setAttribute("content", title || "The Impostor");
			} catch (e) {}
		};
		i18n.on("languageChanged", handleChange);
		return () => {
			i18n.off("languageChanged", handleChange);
		};
  }, [i18n, i18n.language]);

  return <>{children}</>;
}
