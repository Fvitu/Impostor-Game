import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from './locales/en/common.json';
import enLanding from './locales/en/landing.json';
import enSetup from './locales/en/setup.json';
import enGame from './locales/en/game.json';
import enScoreboard from './locales/en/scoreboard.json';
import enOnline from './locales/en/online.json';

import esCommon from './locales/es/common.json';
import esLanding from './locales/es/landing.json';
import esSetup from './locales/es/setup.json';
import esGame from './locales/es/game.json';
import esScoreboard from './locales/es/scoreboard.json';
import esOnline from './locales/es/online.json';

export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export function getSavedLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const saved = localStorage.getItem('impostor_language');
    if (saved && SUPPORTED_LANGUAGES.includes(saved as SupportedLanguage)) {
      return saved as SupportedLanguage;
    }
  } catch {
    // localStorage may be unavailable
  }
  return DEFAULT_LANGUAGE;
}

// Temporarily suppress the i18next sponsorship/info message during init
const _origConsoleLog = console.log;
const _origConsoleInfo = console.info;
const _origConsoleWarn = console.warn;
try {
  const shouldSuppress = (args: any[]) =>
    typeof args[0] === 'string' && args[0].includes('i18next is maintained with support from Locize');

  console.log = (...args: any[]) => {
    if (shouldSuppress(args)) return;
    return _origConsoleLog.apply(console, args as any);
  };
  console.info = (...args: any[]) => {
    if (shouldSuppress(args)) return;
    return _origConsoleInfo.apply(console, args as any);
  };
  console.warn = (...args: any[]) => {
    if (shouldSuppress(args)) return;
    return _origConsoleWarn.apply(console, args as any);
  };
} catch {}

i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      landing: enLanding,
      setup: enSetup,
      game: enGame,
      scoreboard: enScoreboard,
      online: enOnline,
    },
    es: {
      common: esCommon,
      landing: esLanding,
      setup: esSetup,
      game: esGame,
      scoreboard: esScoreboard,
      online: esOnline,
    },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common',
  ns: ['common', 'landing', 'setup', 'game', 'scoreboard', 'online'],
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

// restore original console methods
try {
  console.log = _origConsoleLog;
  console.info = _origConsoleInfo;
  console.warn = _origConsoleWarn;
} catch {}

export default i18n;
