import { Hono, Context } from 'hono';
import { AppEnv } from '../../hono.config';
import { Registry } from '../core/registry';
import { Migrator } from '../core/migrator';
import { Database } from '../core/database';
import { I18n } from '../core/i18n';

// Import HTML Templates
// @ts-ignore
import dashboardTemplate from './views/dashboard.html';
// @ts-ignore
import settingsTemplate from './views/settings.html';

const admin = new Hono<AppEnv>();

/**
 * HELPER: renderAdmin
 * Wraps page content into the shared Admin Dashboard shell.
 * It replaces all placeholders in dashboard.html to maintain a consistent UI.
 */
export async function renderAdmin(c: Context<AppEnv>, title: string, content: string) {
    const locale = c.get('locale') || 'en';
    const i18n = new I18n(locale);

    // FIX: Menggunakan class Tailwind lengkap agar menu tampil rapi (Block + Padding + Hover)
    // Kita tidak menggunakan class 'nav-item-link' lagi karena @apply tidak jalan di CDN.
    const menuItemClass = "flex items-center px-3 py-2 text-sm font-medium text-gray-400 rounded-md hover:bg-white/5 hover:text-white transition-colors group mb-1";
    const iconSpan = `<span class="w-2 h-2 rounded-full bg-gray-600 mr-3 group-hover:bg-accent transition-colors"></span>`;

    const plugins = Registry.getMenus('plugin')
        .map(m => `<a href="${m.path}" class="${menuItemClass}">${iconSpan} ${i18n.t(m.title)}</a>`)
        .join('\n');

    const themes = Registry.getMenus('theme')
        .map(m => `<a href="${m.path}" class="${menuItemClass}">${iconSpan} ${i18n.t(m.title)}</a>`)
        .join('\n');

    let html = dashboardTemplate
        .replace('{{title}}', title)
        .replace('{{sidebar_plugins}}', plugins)
        .replace('{{sidebar_themes}}', themes)
        .replace('{{plugin_count}}', Registry.getPluginCount().toString())
        .replace('{{content}}', content);
        
    return c.html(html);
}

// ===========================================================================
// 1. SETUP / INITIALIZATION ROUTE (EMERGENCY ACCESS)
// ===========================================================================
/**
 * Handles the "Admin Entry" form. 
 * Validates the Master Key and initializes the core database tables.
 */
admin.post('/setup', async (c) => {
    try {
        const body = await c.req.parseBody();
        const inputKey = body['master_key'];

        // Security Check
        if (!inputKey || inputKey !== c.env.MASTER_KEY) {
            return c.text('ACCESS DENIED: Invalid Master Key.', 401);
        }

        const db = new Database(c.env.CORE_DB);

        // Execute Core Schema Migration
        const coreSchema = Registry.getSchema('core-system');
        if (coreSchema) {
            await db.raw(coreSchema.schema || coreSchema.sql);
        }

        // Initialize Default System Settings
        const adminCheck = await db.findOne("SELECT * FROM core_settings WHERE key = 'admin_email'");
        if (!adminCheck) {
             await db.raw(`
                INSERT OR IGNORE INTO core_settings (key, value, group_name) VALUES 
                ('site_name', 'PasPages Core', 'general'),
                ('admin_email', 'admin@example.com', 'general'),
                ('storage_driver', 'r2', 'storage');
            `);
        }

        return c.html(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { background: #000; color: #00ff9d; font-family: monospace; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    h1 { border: 2px solid #00ff9d; padding: 10px; }
                    .btn { color: #000; background: #00ff9d; padding: 10px 20px; text-decoration: none; font-weight: bold; margin-top: 20px; }
                </style>
            </head>
            <body>
                <h1>SYSTEM UNLOCKED</h1>
                <p>Core Schemas Injected Successfully.</p>
                <a href="/admin" class="btn">ENTER DASHBOARD &rarr;</a>
            </body>
            </html>
        `);
    } catch (e: any) {
        return c.text(`CRITICAL ERROR: ${e.message}`, 500);
    }
});

// ===========================================================================
// 2. DASHBOARD INDEX
// ===========================================================================
/**
 * Main Admin Landing Page.
 * Displays system health and active module statistics in a grid.
 */
admin.get('/', async (c) => {
    const locale = c.get('locale');
    const i18n = new I18n(locale);

    // Note: We wrap the content in a div that doesn't trigger the "content-area" reset styles 
    // unless we want it to, but here we use custom grid layout.
    const dashboardContent = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div class="card p-6 bg-[#111] border border-[#222] rounded-xl">
                <h3 class="text-xs font-bold text-[#00ff9d] uppercase tracking-widest mb-2">System Status</h3>
                <div class="text-2xl font-bold text-white">OPERATIONAL</div>
            </div>
            <div class="card p-6 bg-[#111] border border-[#222] rounded-xl">
                <h3 class="text-xs font-bold text-[#00ff9d] uppercase tracking-widest mb-2">Active Modules</h3>
                <div class="text-2xl font-bold text-white">${Registry.getPluginCount()} <span class="text-sm text-gray-500 font-normal">Plugins Loaded</span></div>
            </div>
            <div class="card p-6 bg-[#111] border border-[#222] rounded-xl">
                <h3 class="text-xs font-bold text-[#00ff9d] uppercase tracking-widest mb-2">Database Engine</h3>
                <div class="text-2xl font-bold text-white">D1 Connected</div>
            </div>
        </div>

        <div class="card p-6 bg-[#111] border border-[#222] rounded-xl">
            <h3 class="text-xs font-bold text-[#00ff9d] uppercase tracking-widest mb-4">Quick Actions</h3>
            <div class="flex gap-4">
                <button onclick="runMigration()" class="bg-[#333] hover:bg-[#444] text-white px-4 py-2 rounded text-sm font-bold border border-[#444] transition-colors">Run Migration</button>
                <a href="/admin/settings" class="bg-[#333] hover:bg-[#444] text-white px-4 py-2 rounded text-sm font-bold border border-[#444] transition-colors inline-block">System Settings</a>
            </div>
            <div id="migration-logs" class="mt-4 font-mono text-xs text-gray-400 bg-black p-4 rounded border border-[#222] hidden"></div>
        </div>

        <script>
            async function runMigration() {
                const logs = document.getElementById('migration-logs');
                logs.classList.remove('hidden');
                logs.innerHTML = 'Initializing migration...';
                try {
                    const res = await fetch('/admin/system/migrate', { method: 'POST' });
                    const data = await res.json();
                    logs.innerHTML = data.logs.join('<br>');
                } catch(e) {
                    logs.innerHTML = '<span style="color:red">Error: ' + e.message + '</span>';
                }
            }
        </script>
    `;
        
    return await renderAdmin(c, i18n.t('admin_title'), dashboardContent);
});

// ===========================================================================
// 3. SETTINGS PAGE
// ===========================================================================
/**
 * Renders the System Settings page for storage and core configurations.
 */
admin.get('/settings', async (c) => {
    const db = new Database(c.env.CORE_DB);
    let settings: any[] = [];
    
    try {
        settings = await db.findAll("SELECT key, value FROM core_settings WHERE group_name='storage'");
    } catch(e) {
        console.warn("Settings table not found. Run migration.");
    }

    const config: Record<string, string> = {};
    settings.forEach(row => config[row.key] = row.value);

    let html = settingsTemplate
        .replace('{{current_driver}}', config['storage_driver'] || 'r2')
        .replace('{{cloudinary_cloud_name}}', config['cloudinary_cloud_name'] || '')
        .replace('{{cloudinary_upload_preset}}', config['cloudinary_upload_preset'] || '')
        .replace('{{gdrive_access_token}}', config['gdrive_access_token'] || '')
        .replace('{{gdrive_folder_id}}', config['gdrive_folder_id'] || '');

    return await renderAdmin(c, "System Settings", html);
});

// ===========================================================================
// 4. SAVE STORAGE SETTINGS (API)
// ===========================================================================
/**
 * Endpoint to update storage configuration in the database.
 */
admin.post('/settings/storage', async (c) => {
    const db = new Database(c.env.CORE_DB);
    const body = await c.req.json();

    const keys = [
        'storage_driver', 
        'cloudinary_cloud_name', 
        'cloudinary_upload_preset', 
        'gdrive_access_token', 
        'gdrive_folder_id'
    ];
    
    for (const key of keys) {
        if (body[key] !== undefined) {
            await db.run(
                "INSERT INTO core_settings (key, value, group_name) VALUES (?, ?, 'storage') ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                [key, body[key]]
            );
        }
    }

    return c.json({ success: true });
});

// ===========================================================================
// 5. SYSTEM MIGRATION TRIGGER (API)
// ===========================================================================
/**
 * Scans all registered schemas in the Registry and applies pending migrations.
 */
admin.post('/system/migrate', async (c) => {
    if (!c.env.CORE_DB) {
        return c.json({ success: false, logs: ["[CRITICAL] D1 Database not connected"] }, 500);
    }
    
    const migrator = new Migrator(c.env.CORE_DB);
    const logs: string[] = [];
    
    try {
        await migrator.initSystem();
        logs.push(`<span style="color: #00ff9d;">[SYSTEM] Migration Engine Ready.</span>`);

        const schemas = Registry.getSchemas();
        if (schemas.length === 0) {
            logs.push(`<span>[INFO] No pending schemas found.</span>`);
        }

        for (const s of schemas) {
            const result = await migrator.applyMigration(s.slug, s.version, s.sql);
            
            if (result.includes('[ERROR]')) {
                logs.push(`<span style="color: #ff4444;">${result}</span>`);
            } else if (result.includes('[SKIP]')) {
                logs.push(`<span style="color: #888;">${result}</span>`);
            } else {
                logs.push(`<span style="color: #00ff9d;">${result}</span>`);
            }
        }

    } catch (err: any) {
        logs.push(`<span style="color: #ff4444;">[FATAL] ${err.message}</span>`);
    }

    return c.json({ logs });
});

export default admin;