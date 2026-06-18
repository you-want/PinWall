import { describe, it, expect } from 'vitest';
import { zh } from './zh';
import { en } from './en';
import { interpolate } from '.';

describe('i18n translations', () => {
  describe('Chinese (zh)', () => {
    it('has all required translation keys', () => {
      const requiredKeys = [
        'loading', 'new_card', 'title_label', 'title_placeholder',
        'content_label', 'content_placeholder', 'color_label',
        'btn_cancel', 'btn_create', 'confirm_delete_msg',
        'welcome_title', 'welcome_subtitle',
      ];
      for (const key of requiredKeys) {
        expect(zh[key as keyof typeof zh]).toBeDefined();
        expect(typeof zh[key as keyof typeof zh]).toBe('string');
      }
    });

    it('has non-empty translation values', () => {
      for (const [key, value] of Object.entries(zh)) {
        expect(value.length).toBeGreaterThan(0);
      }
    });

    it('has correct default title', () => {
      expect(zh.new_card).toBe('新建便签');
    });

    it('has correct cancel button text', () => {
      expect(zh.btn_cancel).toBe('取消');
    });

    it('has correct create button text', () => {
      expect(zh.btn_create).toBe('创建');
    });
  });

  describe('English (en)', () => {
    it('has all required translation keys', () => {
      const requiredKeys = [
        'loading', 'new_card', 'title_label', 'title_placeholder',
        'content_label', 'content_placeholder', 'color_label',
        'btn_cancel', 'btn_create', 'confirm_delete_msg',
        'welcome_title', 'welcome_subtitle',
      ];
      for (const key of requiredKeys) {
        expect(en[key as keyof typeof en]).toBeDefined();
        expect(typeof en[key as keyof typeof en]).toBe('string');
      }
    });

    it('has non-empty translation values', () => {
      for (const [key, value] of Object.entries(en)) {
        expect(value.length).toBeGreaterThan(0);
      }
    });

    it('has correct default title', () => {
      expect(en.new_card).toBe('New Note');
    });

    it('has correct cancel button text', () => {
      expect(en.btn_cancel).toBe('Cancel');
    });

    it('has correct create button text', () => {
      expect(en.btn_create).toBe('Create');
    });
  });

  describe('interpolate', () => {
    it('replaces {{n}} placeholder', () => {
      const result = interpolate('颜色 {{n}}', { n: 3 });
      expect(result).toBe('颜色 3');
    });

    it('replaces multiple placeholders', () => {
      const result = interpolate('{{greeting}}, {{name}}!', {
        greeting: 'Hello',
        name: 'World',
      });
      expect(result).toBe('Hello, World!');
    });

    it('leaves unknown placeholders untouched', () => {
      const result = interpolate('Hello {{missing}}', { other: 'value' });
      expect(result).toBe('Hello {{missing}}');
    });
  });
});
