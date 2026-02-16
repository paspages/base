import { Hono } from 'hono';
import { Registry } from '../../core/registry';
import { Database } from '../../core/database';
import { AppEnv } from '../../../hono.config';
import { renderAdmin } from '../../admin/routes';

// Import View (Diharuskan untuk esbuild agar tidak error)
// @ts-ignore
import adminSettingsHtml from './views/admin_settings.html';

export const manifest = {
    slug: 'site-manager',
    name: 'Site Configuration',
    version: '1.2.0', // Bump version for new architecture
    type: 'plugin' as const,
    description: 'Core settings: Homepage routing, Identity, and Global Navigation.',
    requires: '1.0.0'
};

const managerSchema = `
    -- Tabel untuk menyimpan konten statis khusus (Home/Identity)
    CREATE TABLE IF NOT EXISTS core_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE,
        title TEXT,
        content TEXT,
        metadata TEXT -- JSON String for SEO/Logo
    );
    
    -- Tabel Menu Global (Header/Footer)
    CREATE TABLE IF NOT EXISTS core_menus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        url TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0
    );
`;

export default function(app: Hono<AppEnv>) {
    // 1. Register Module & Schema
    Registry.log("Mounting Site Manager...");
    Registry.registerPlugin(manifest.slug);
    Registry.registerSchema(manifest.slug, manifest.version, managerSchema);
    
    // 2. Register Admin Menu (Settings Category)
    Registry.registerMenu({ 
        title: 'Site Identity', 
        path: '/admin/site-manager', 
        category: 'settings', 
        icon: 'globe' 
    });

    const getDb = (c: any) => new Database(c.env.CORE_DB);

    // ===========================================================================
    // ADMIN DASHBOARD
    // ===========================================================================
    
    const manager = new Hono<AppEnv>();

    // View: Site Settings Dashboard
    manager.get('/', async (c) => {
        const db = getDb(c);
        
        // Fetch all necessary data parallelly
        const [home, identityRow, menus] = await Promise.all([
            db.findOne("SELECT * FROM core_pages WHERE slug = 'home'"),
            db.findOne("SELECT * FROM core_pages WHERE slug = 'identity'"),
            db.findAll("SELECT * FROM core_menus ORDER BY sort_order ASC")
        ]);

        const meta = identityRow ? JSON.parse(identityRow.metadata || '{}') : {};
        
        // Data Payload untuk View
        const viewData = {
            home: home || { title: '', content: '' },
            identity: {
                logo: meta.logo || '',
                favicon: meta.favicon || '',
                meta_title: meta.meta_title || '',
                meta_description: meta.meta_description || ''
            },
            menus: menus
        };

        // Render HTML File
        return renderAdmin(c, 'Site Manager', adminSettingsHtml.replace('{{data}}', JSON.stringify(viewData)));
    });

    // API: Save Identity (Logo/SEO)
    manager.post('/identity', async (c) => {
        const db = getDb(c);
        const body = await c.req.json();
        // Upsert Identity
        await db.run("INSERT INTO core_pages (slug, metadata) VALUES ('identity', ?) ON CONFLICT(slug) DO UPDATE SET metadata=excluded.metadata", [JSON.stringify(body)]);
        Registry.log("[Site Manager] Identity updated");
        return c.json({ success: true });
    });

    // API: Save Homepage Content (Hero Section)
    manager.post('/home', async (c) => {
        const db = getDb(c);
        const { title, content } = await c.req.json();
        // Upsert Home
        await db.run("INSERT INTO core_pages (slug, title, content) VALUES ('home', ?, ?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title, content=excluded.content", [title, content]);
        Registry.log("[Site Manager] Homepage content updated");
        return c.json({ success: true });
    });

    // API: Add Menu Item
    manager.post('/menu', async (c) => {
        const db = getDb(c);
        const { label, url, sort_order } = await c.req.json();
        await db.run("INSERT INTO core_menus (label, url, sort_order) VALUES (?, ?, ?)", [label, url, sort_order]);
        return c.json({ success: true });
    });

    // API: Delete Menu Item
    manager.post('/menu/delete', async (c) => {
        const db = getDb(c);
        const { id } = await c.req.json();
        await db.run("DELETE FROM core_menus WHERE id = ?", [id]);
        return c.json({ success: true });
    });

    // Mount Admin Routes
    app.route('/admin/site-manager', manager);
    
    Registry.log("Site Manager Mounted [OK]");
}