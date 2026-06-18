import { describe, it, expect, vi } from 'vitest';
import { useLanguageStore } from '@/stores/languageStore';

function resetStore() {
  useLanguageStore.setState({ lang: 'zh' });
}

describe('useLanguageStore', () => {
  beforeEach(() => {
    resetStore();
  });

  it('defaults to zh', () => {
    expect(useLanguageStore.getState().lang).toBe('zh');
  });

  it('can change language', () => {
    useLanguageStore.getState().setLang('en');
    expect(useLanguageStore.getState().lang).toBe('en');
  });

  it('persists language through multiple reads', () => {
    useLanguageStore.getState().setLang('en');
    expect(useLanguageStore.getState().lang).toBe('en');
    useLanguageStore.getState().setLang('zh');
    expect(useLanguageStore.getState().lang).toBe('zh');
  });
});
