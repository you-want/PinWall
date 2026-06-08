import { useMemo } from "react";
import { zh } from "./zh";
import { en } from "./en";
import { useLanguageStore, type Lang } from "../stores/languageStore";

export type { Lang };

const translations = { zh, en } as const;

export type Translations = Record<keyof typeof zh, string>;

/**
 * Returns { lang, t, setLang }.
 * `t` is a fully-typed translation object for the active language.
 */
export function useI18n() {
  const lang = useLanguageStore((s) => s.lang);
  const setLang = useLanguageStore((s) => s.setLang);

  const t = useMemo(() => translations[lang], [lang]);

  return { lang, t, setLang };
}

/** Helper: get translations for a given language (non-hook). */
export function getTranslations(lang: Lang): Translations {
  return translations[lang];
}

/**
 * Interpolate a template string like "颜色 {{n}}" with values.
 * Usage: interpolate(t.color_n, { n: 3 }) → "颜色 3"
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`,
  );
}
