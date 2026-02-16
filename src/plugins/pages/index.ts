import { Hono } from 'hono';
import { Registry } from '../../core/registry';
import { Database } from '../../core/database';
import { AppEnv } from '../../../hono.config';
import { renderAdmin } from '../../admin/routes';

// Views Imports
// @ts-ignore
import adminPagesListHtml from './views/admin_list.html';
// @ts-ignore
import adminPagesEditorHtml from './views/admin_editor.html';
// @ts-ignore
import publicPageHtml from './views/public_view.html';

export const manifest = {
    slug: 'pages-manager',
    name: 'Pages Manager',
    version: '1.0.2', // Bump version agar migrasi berjalan ulang
    type: 'plugin' as const,
    description: 'Manage static pages and custom landing pages.',
    requires: '1.0.0'
};

// SQL SCHEMA CORRECTION:
// Pastikan tidak ada spasi/newline berlebih yang menyebabkan query kosong terdeteksi
const pagesSchema = `CREATE TABLE IF NOT EXISTS static_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    status TEXT DEFAULT 'published',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`;

export default function(app: Hono<AppEnv>) {
    // 1. Register Schema dengan Logging
    Registry.log("Mounting Pages Manager...");
    Registry.registerSchema(manifest.slug, manifest.version, pagesSchema);
    Registry.registerMenu({ title: 'All Pages', path: '/admin/pages', category: 'plugin', icon: 'file' });

    const getDb = (c: any) => new Database(c.env.CORE_DB);

    // ===========================================================================
    // PUBLIC ROUTES
    // ===========================================================================
    
    // Public Page Viewer
    app.get('/p/:slug', async (c) => {
        const slug = c.req.param('slug');
        const db = getDb(c);
        const page = await db.findOne("SELECT * FROM static_pages WHERE slug = ? AND status = 'published'", [slug]);
        
        if (!page) return c.notFound();

        // Render with Public Template
        return c.html(publicPageHtml
            .replace('{{title}}', page.title)
            .replace('{{content}}', page.content)
            .replace('{{slug}}', page.slug)
        );
    });

    // API: List Pages (Untuk dropdown di Site Manager)
    app.get('/api/pages/list', async (c) => {
        const pages = await getDb(c).findAll("SELECT id, title FROM static_pages WHERE status = 'published' ORDER BY title ASC");
        return c.json(pages);
    });

    // ===========================================================================
    // ADMIN ROUTES
    // ===========================================================================

    // List Pages
    app.get('/admin/pages', async (c) => {
        const pages = await getDb(c).findAll("SELECT * FROM static_pages ORDER BY created_at DESC");
        return renderAdmin(c, 'Pages Manager', adminPagesListHtml.replace('{{pages_data}}', JSON.stringify(pages)));
    });

    // Page Editor
    app.get('/admin/pages/editor', async (c) => {
        const id = c.req.query('id');
        const db = getDb(c);
        let page = { title: '', slug: '', content: '', status: 'published' };
        if (id) {
            const found = await db.findOne("SELECT * FROM static_pages WHERE id = ?", [id]);
            if (found) page = found;
        }
        return renderAdmin(c, 'Page Editor', adminPagesEditorHtml.replace('{{page_data}}', JSON.stringify(page)));
    });

    // Save Page
    app.post('/admin/pages/save', async (c) => {
        const db = getDb(c);
        const { id, title, slug, content, status } = await c.req.json();
        const finalSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        
        if (id) {
            await db.run("UPDATE static_pages SET title=?, slug=?, content=?, status=? WHERE id=?", [title, finalSlug, content, status, id]);
        } else {
            await db.run("INSERT INTO static_pages (title, slug, content, status) VALUES (?, ?, ?, ?)", [title, finalSlug, content, status]);
        }
        return c.json({ success: true });
    });

    // Delete Page
    app.post('/admin/pages/delete', async (c) => {
        const { id } = await c.req.json();
        await getDb(c).run("DELETE FROM static_pages WHERE id = ?", [id]);
        return c.json({ success: true });
    });
    
    Registry.log("Pages Manager Mounted [OK]");
}