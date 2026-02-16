import { Hono } from 'hono';
import { Registry } from '../../core/registry';
import { ModuleManifest } from '../../core/types';
import { AppEnv } from '../../../hono.config';
import { renderAdmin } from '../../admin/routes';

// Import HTML Templates
// @ts-ignore
import landingHtml from './landing.html';
// @ts-ignore
import settingsHtml from './settings.html';

/**
 * THEME MANIFEST
 * Strict compliance with Core v1.0.0 requirements.
 */
export const manifest: ModuleManifest = {
    type: 'theme',
    slug: 'nebula-theme',
    name: 'Nebula Future Theme',
    version: '1.0.0',
    description: 'A futuristic dark theme with glassmorphism UI.',
    requires: '1.0.0' // Explicitly required for the Validator
};

/**
 * Theme Module Initialization
 * Registers views, menus, and configuration routes.
 */
export default function(app: Hono<AppEnv>) {
    
    // 1. Register Templates to the global Registry
    // This allows the ViewEngine to render 'landing' using this theme
    Registry.registerThemeView(manifest.slug, 'landing', landingHtml);
    
    // 2. Register Admin Menu for consistency in the sidebar
    Registry.registerMenu({
        title: 'Nebula Theme',
        path: '/admin/theme/nebula',
        category: 'theme'
    });

    // 3. Define Admin Routes for Theme Configuration
    const themeAdmin = new Hono<AppEnv>();
    
    themeAdmin.get('/', async (c) => {
        // Use the shared renderAdmin helper to preserve the sidebar
        // Arguments: Context, Page Title, HTML Content
        return await renderAdmin(c, 'Nebula Configuration', settingsHtml);
    });

    themeAdmin.post('/save', async (c) => {
        // Handle theme configuration persistence
        // In a real scenario, this would save to the core_settings table
        const body = await c.req.json();
        return c.json({ success: true, message: "Theme settings saved!", data: body });
    });

    // Mount Theme Admin Routes
    app.route('/admin/theme/nebula', themeAdmin);

    // 4. Set as Active Theme for the ViewEngine
    Registry.setActiveTheme(manifest.slug);

    console.log(`[Theme] ${manifest.name} loaded successfully.`);
}