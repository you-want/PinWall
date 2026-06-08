import { createContext, useContext } from 'react'
import { zh } from './zh'
import { en } from './en'

export type Lang = 'zh' | 'en'

const translations = { zh, en }

export type Translations = Record<keyof typeof zh, string>

export const I18nContext = createContext<{
  lang: Lang
  t: Translations
  setLang: (lang: Lang) => void
}>({
  lang: 'zh',
  t: zh,
  setLang: () => {},
})

export function useI18n() {
  return useContext(I18nContext)
}

export function getTranslations(lang: Lang): Translations {
  return translations[lang]
}
