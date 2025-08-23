import { useLanguage } from '../context/LanguageContext';
import { getTranslations } from '../translations';

export default function LanguageSwitcher() {
  const { currentLanguage, changeLanguage } = useLanguage();
  const t = getTranslations(currentLanguage);

  return (
    <div className="relative">
      <select
        value={currentLanguage}
        onChange={(e) => changeLanguage(e.target.value)}
        className="appearance-none rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      >
        <option value="en">{t.english}</option>
        <option value="bn">{t.bangla}</option>
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2">
        <svg className="h-4 w-4 fill-current text-gray-400" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </div>
    </div>
  );
}

