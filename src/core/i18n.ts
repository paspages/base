import { Context } from 'hono';
import { CONFIG } from '../../hono.config';
import { Registry } from './registry'; // Import Registry

/**
 * INTERNATIONALIZATION (i18n) ENGINE - DYNAMIC VERSION
 * Fetches translations from the Registry instead of hardcoded files.
 */
export class I18n {
  private locale: string;

  constructor(locale: string) {
    this.locale = locale;
  }

  /**
   * Translate a key dynamically.
   * Logic:
   * 1. Check Registry for requested locale (e.g., 'id')
   * 2. Check Registry for default locale (e.g., 'en') - Fallback
   * 3. Return Key itself - Last Resort
   */
  t(key: string): string {
    // 1. Try Primary Locale
    let val = Registry.getTranslation(this.locale, key);
    if (val) return val;

    // 2. Try Default Locale (Fallback)
    if (this.locale !== CONFIG.defaultLocale) {
        val = Registry.getTranslation(CONFIG.defaultLocale, key);
        if (val) return val;
    }

    // 3. Return Key (Debugging friendly)
    return key;
  }

  static getLocaleFromContext(c: Context): 'en' | 'id' {
    const q = c.req.query('lang');
    if (q === 'id' || q === 'en') return q;
    return CONFIG.defaultLocale;
  }
}
