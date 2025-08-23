import { en } from './en';
import { bn } from './bn';

export const translations = {
  en,
  bn,
};

export const getTranslations = (language) => {
  return translations[language] || translations.en;
};

