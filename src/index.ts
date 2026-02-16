import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AppEnv, CONFIG } from '../hono.config';
import { Validator } from './core/validator';
import { Registry } from './core/registry';
import { ViewEngine } from './core/view';
import { I18n } from './core/i18n';
import adminRoutes from './admin/routes';
import { PasPagesModule } from './core/types';
import { Database } from './core/database'; // Import Database

// Load Modules
import { modules } from './modules.gen';

// ===========================================================================
// 1. CORE REGISTRATIONS
// ===========================================================================

Registry.registerTranslation('en', {
    'welcome': 'Welcome to PasPages Core',
    'admin_title': 'Admin Dashboard',
    'status_operational': 'OPERATIONAL'
});

// Core Schema: Stores Homepage Settings
const coreSchema = `
    CREATE TABLE IF NOT EXISTS core_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        group_name TEXT DEFAULT 'general',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    -- Default Homepage is 'default' (Static Landing Page)
    INSERT OR IGNORE INTO core_settings (key, value, group_name) VALUES 
    ('site_name', 'PasPages Core', 'general'),
    ('homepage_type', 'default', 'reading'), 
    ('homepage_target_id', '', 'reading');
`;

Registry.registerSchema('core-system', CONFIG.CORE_VERSION, coreSchema);

// ===========================================================================
// 2. APP SETUP
// ===========================================================================

const app = new Hono<AppEnv>();

app.use('*', cors({ origin: CONFIG.corsOrigin }));

// Static Assets
app.get('/assets/*', async (c) => {
    try {
        // @ts-ignore
        if (c.env.ASSETS) return await c.env.ASSETS.fetch(c.req.raw);
        return c.notFound();
    } catch (e) { return c.notFound(); }
});

// Locale Middleware
app.use('*', async (c, next) => {
    c.set('locale', I18n.getLocaleFromContext(c));
    await next();
});

// ===========================================================================
// 3. MODULE LOADER
// ===========================================================================

modules.forEach((mod: any) => {
    if (mod && mod.manifest) {
        const type = mod.manifest.type;
        if (Validator.validate(mod, type).isValid) {
            const m = mod as PasPagesModule;
            if (type === 'plugin') Registry.registerPlugin(m.manifest.slug);
            m.default(app);
            
            // Log successful mount for Nebula Terminal
            Registry.log(`Module mounted: ${m.manifest.slug} v${m.manifest.version}`);
        }
    }
});

// ===========================================================================
// 4. CORE ROUTING & SMART HOMEPAGE (SITE MANAGER)
// ===========================================================================

app.route('/admin', adminRoutes);

/**
 * ROOT ROUTE (/)
 * Logic: Check DB -> Check Settings -> Render Content or Default Landing
 */
app.get('/', async (c) => {
    try {
        const db = new Database(c.env.CORE_DB);

        // A. Check Database Settings
        // Use try-catch for queries so it falls back to Catch if tables don't exist (Fresh Install)
        const homeTypeSetting = await db.findOne("SELECT value FROM core_settings WHERE key = 'homepage_type'");
        const homeTargetSetting = await db.findOne("SELECT value FROM core_settings WHERE key = 'homepage_target_id'");
        
        const homeType = homeTypeSetting?.value || 'default';

        // B. Branching Logic based on Admin Settings
        
        // CASE 1: Homepage set to 'Blog'
        if (homeType === 'blog') {
            // Redirect to blog plugin route
            return c.redirect('/blog');
        }

        // CASE 2: Homepage set to 'Page' (Static Page)
        if (homeType === 'page' && homeTargetSetting?.value) {
            // Try to fetch page data from 'static_pages' table (renamed from 'pages' to avoid conflicts)
            try {
                const page = await db.findOne("SELECT * FROM static_pages WHERE id = ?", [homeTargetSetting.value]);
                
                if (page) {
                    // Render using 'public_page' template from Registry
                    // (This template is registered by Pages Manager Plugin)
                    let template = Registry.getView('public_page');
                    
                    // Fallback template if pages plugin hasn't loaded its view
                    if (!template) {
                        template = `<!DOCTYPE html><html><head><title>${page.title}</title><script src="https://cdn.tailwindcss.com"></script></head><body class="p-10 prose max-w-none"><h1>${page.title}</h1><div>${page.content}</div></body></html>`;
                    }
                    
                    // Replace placeholders with database content
                    return c.html(template
                        .replace('{{title}}', page.title)
                        .replace('{{content}}', page.content)
                        .replace('{{slug}}', page.slug)
                    );
                }
            } catch (pageError) {
                console.error("Page Plugin not installed or table missing", pageError);
                Registry.log("Error: Page plugin missing or table not found.");
                // If failed (e.g., pages plugin deleted), proceed to default
            }
        }

        // CASE 3: Homepage 'Default' or Setting Not Found
        // (Executed if homeType === 'default' or code above fails)
        throw new Error('Render Default Landing');

    } catch (e) {
        // C. DEFAULT LANDING PAGE (FALLBACK)
        // Executed if:
        // 1. Database not migrated (core_settings table missing)
        // 2. Setting is default
        // 3. Error occurring during Blog/Page query
        
        // Log the fallback event
        Registry.log("System Status: Rendering Default Landing Page.");

        return ViewEngine.render(c, 'landing', { 
            plugin_count: Registry.getPluginCount(),
            core_version: CONFIG.CORE_VERSION,
            // Pass the logs to the view so the terminal can display them!
            system_logs: Registry.getLogs(),
            status: 'System Ready - Please configure Homepage in Admin'
        });
    }
});

app.notFound((c) => {
    return c.text('404 - Page Not Found', 404);
});

export default app;