import { create } from "zustand";
import { createAppStore } from "../services/appStore";

export type Lang = "zh" | "en";

type LanguageState = {
  lang: Lang;
  setLang: (lang: Lang) => void;
};

function detectLang(): Lang {
  try {
    const nav = navigator.language || "";
    return nav.startsWith("zh") ? "zh" : "en";
  } catch {
    return "en";
  }
}

export const useLanguageStore = create<LanguageState>((set) => ({
  lang: detectLang(),
  setLang: (lang) => set({ lang }),
}));

export const languageTauriHandler = createAppStore("language", useLanguageStore, {
  saveOnChange: true,
});
