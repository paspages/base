import { Hono } from 'hono';
import { Registry } from '../../core/registry';
import { ModuleManifest } from '../../core/types';

// Import HTML Template
// @ts-ignore
import landingHtml from './landing.html';

/**
 * DEFAULT THEME MODULE
 * Provides the fallback visual interface for the system.
 */
export const manifest: ModuleManifest = {
    type: 'theme',
    slug: 'default',
    name: 'PasPages Default Theme',
    version: '1.0.0',
    author: 'PasPages Core',
    minCoreVersion: '1.0.0'
};

export default function(app: Hono) {
    // Register the landing view for the 'default' theme
    Registry.registerThemeView('default', 'landing', landingHtml);
    
    // Note: We do NOT enforce setActiveTheme here.
    // This allows other custom themes to take precedence if active.
}
