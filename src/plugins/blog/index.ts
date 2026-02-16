import { Hono } from 'hono';
import { Registry } from '../../core/registry';
import { Database } from '../../core/database';
import { AppEnv } from '../../../hono.config';
import { renderAdmin } from '../../admin/routes';

// ===========================================================================
// NEBULA VIEW IMPORTS
// ===========================================================================
// @ts-ignore
import adminListHtml from './views/admin_list.html';
// @ts-ignore
import adminEditorHtml from './views/admin_editor.html';
// @ts-ignore
import adminCategoriesHtml from './views/admin_categories.html';
// @ts-ignore
import adminTagsHtml from './views/admin_tags.html';
// @ts-ignore
import adminWidgetsHtml from './views/admin_widgets.html';
// @ts-ignore
import adminMenusHtml from './views/admin_menus.html';
// @ts-ignore
import publicIndexHtml from './views/public_index.html';
// @ts-ignore
import publicPostHtml from './views/public_post.html';

// NOTE: adminSettingsHtml REMOVED (Moved to Site Manager)

export const manifest = {
    slug: 'blog-manager',
    name: 'PasPages Blog Pro',
    version: '1.7.2',
    type: 'plugin' as const,
    description: 'Advanced Blogging System with Categories, Tags, and Widgets.',
    requires: '1.0.0'
};

/**
 * FULL DATABASE SCHEMA
 * Removed: blog_settings table (Now handled by Core/Site Manager)
 */
const blogSchema = `
    CREATE TABLE IF NOT EXISTS blog_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        excerpt TEXT,
        thumbnail_url TEXT,
        author_name TEXT DEFAULT 'Admin',
        category_id INTEGER,
        views INTEGER DEFAULT 0,
        status TEXT DEFAULT 'published',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS blog_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT
    );
    CREATE TABLE IF NOT EXISTS blog_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS blog_post_tags (
        post_id INTEGER,
        tag_id INTEGER,
        PRIMARY KEY (post_id, tag_id)
    );
    CREATE TABLE IF NOT EXISTS blog_widgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        type TEXT NOT NULL, 
        content TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS blog_menus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER DEFAULT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        target TEXT DEFAULT '_self'
    );
`;

export default function(app: Hono<AppEnv>) {
    // [LOG START]
    Registry.log("Initializing Blog Manager...");

    // 1. Initial Registration
    Registry.registerSchema(manifest.slug, manifest.version, blogSchema);
    
    // 2. Admin Menu Registry
    // REMOVED: Site Settings Menu (Moved to Site Manager)
    Registry.registerMenu({ title: 'All Posts', path: '/admin/blog', category: 'plugin', icon: 'file-text' });
    Registry.registerMenu({ title: 'Categories', path: '/admin/blog/categories', category: 'plugin', icon: 'folder' });
    Registry.registerMenu({ title: 'Tags', path: '/admin/blog/tags', category: 'plugin', icon: 'tag' });
    Registry.registerMenu({ title: 'Menu Manager', path: '/admin/blog/menus', category: 'plugin', icon: 'menu' });
    Registry.registerMenu({ title: 'Widget Manager', path: '/admin/blog/widgets', category: 'plugin', icon: 'layout' });

    // [LOG CHECKPOINT]
    Registry.log("Blog Admin Menus Registered");

    const getDb = (c: any) => new Database(c.env.CORE_DB);

    /**
     * SAFE THEME RESOLVER
     */
    const resolveView = (c: any, viewName: string, fallbackHtml: string) => {
        try {
            const activeTheme = c.env.ACTIVE_THEME || 'nebula';
            if (typeof (Registry as any).getThemeView === 'function') {
                const themeTemplate = (Registry as any).getThemeView(activeTheme, viewName);
                if (themeTemplate) return themeTemplate;
            }
        } catch (e) {}
        return fallbackHtml;
    };

    // ===========================================================================
    // PUBLIC ROUTES
    // ===========================================================================
    
    app.get('/blog', async (c) => c.html(resolveView(c, 'blog_index', publicIndexHtml)));
    app.get('/blog/category/:slug', async (c) => c.html(resolveView(c, 'blog_index', publicIndexHtml)));
    app.get('/blog/tag/:slug', async (c) => c.html(resolveView(c, 'blog_index', publicIndexHtml)));
    app.get('/post/:slug', async (c) => c.html(resolveView(c, 'blog_post', publicPostHtml)));

    // RSS Feed
    app.get('/blog/feed', async (c) => {
        const db = getDb(c);
        const posts = await db.findAll(`SELECT p.*, c.name as category_name FROM blog_posts p LEFT JOIN blog_categories c ON p.category_id = c.id WHERE p.status = 'published' ORDER BY p.created_at DESC LIMIT 20`);
        const domain = new URL(c.req.url).origin;
        const xml = `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0"><channel><title>PasPages Blog</title><link>${domain}/blog</link>${posts.map((p: any) => `<item><title><![CDATA[${p.title}]]></title><link>${domain}/post/${p.slug}</link><pubDate>${new Date(p.created_at).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
        return c.text(xml, 200, { 'Content-Type': 'application/xml; charset=utf-8' });
    });

    // ===========================================================================
    // PUBLIC API ENDPOINTS
    // ===========================================================================

    app.get('/api/blog/menus', async (c) => c.json(await getDb(c).findAll("SELECT * FROM blog_menus ORDER BY sort_order ASC")));
    app.get('/api/blog/widgets', async (c) => c.json(await getDb(c).findAll("SELECT * FROM blog_widgets WHERE is_active = 1 ORDER BY sort_order ASC")));
    app.get('/api/blog/sidebar', async (c) => {
        const categories = await getDb(c).findAll("SELECT c.*, (SELECT COUNT(*) FROM blog_posts WHERE category_id = c.id AND status = 'published') as count FROM blog_categories c");
        return c.json({ categories });
    });

    app.get('/api/blog', async (c) => {
        const cat = c.req.query('category');
        const search = c.req.query('search');
        let sql = "SELECT p.*, c.name as category_name, c.slug as category_slug FROM blog_posts p LEFT JOIN blog_categories c ON p.category_id = c.id WHERE p.status = 'published'";
        const params: any[] = [];
        if (cat) { sql += " AND c.slug = ?"; params.push(cat); }
        if (search) { sql += " AND (p.title LIKE ? OR p.content LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
        sql += " ORDER BY p.created_at DESC";
        return c.json(await getDb(c).findAll(sql, params));
    });

    app.get('/api/blog/post/:slug', async (c) => {
        const slug = c.req.param('slug').split('/')[0];
        const db = getDb(c);
        const post = await db.findOne("SELECT p.*, c.name as category_name, c.slug as category_slug FROM blog_posts p LEFT JOIN blog_categories c ON p.category_id = c.id WHERE p.slug = ? AND p.status = 'published'", [slug]);
        if (!post) return c.json({ error: 'Not Found' }, 404);
        const tags = await db.findAll("SELECT t.name, t.slug FROM blog_tags t JOIN blog_post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = ?", [post.id]);
        post.tags_list = tags;
        await db.run("UPDATE blog_posts SET views = views + 1 WHERE id = ?", [post.id]);
        return c.json(post);
    });

    // ===========================================================================
    // ADMIN DASHBOARD ROUTES
    // ===========================================================================
    
    // NOTE: Site Settings Routes REMOVED from here.

    // --- BLOG POSTS ---
    app.get('/admin/blog', async (c) => renderAdmin(c, 'Blog Manager', adminListHtml.replace('{{posts_data}}', JSON.stringify(await getDb(c).findAll("SELECT p.*, c.name as category_name FROM blog_posts p LEFT JOIN blog_categories c ON p.category_id = c.id ORDER BY p.created_at DESC")))));

    app.get('/admin/blog/editor', async (c) => {
        const id = c.req.query('id');
        const db = getDb(c);
        let post = { title: '', slug: '', content: '', excerpt: '', thumbnail_url: '', category_id: null, tags: '', status: 'published' };
        if (id) {
            const found = await db.findOne("SELECT * FROM blog_posts WHERE id = ?", [id]);
            if (found) {
                post = found;
                const tags = await db.findAll("SELECT t.name FROM blog_tags t JOIN blog_post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = ?", [id]);
                post.tags = tags.map((t: any) => t.name).join(', ');
            }
        }
        const categories = await db.findAll("SELECT id, name FROM blog_categories ORDER BY name ASC");
        return renderAdmin(c, id ? 'Edit Post' : 'New Post', adminEditorHtml.replace('{{post_data}}', JSON.stringify(post)).replace('{{categories_data}}', JSON.stringify(categories)));
    });

    app.post('/admin/blog/save', async (c) => {
        const db = getDb(c);
        const { id, title, slug, content, excerpt, thumbnail_url, category_id, tags, status } = await c.req.json();
        const finalSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        let postId = id;
        if (id) await db.run("UPDATE blog_posts SET title=?, slug=?, content=?, excerpt=?, thumbnail_url=?, category_id=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", [title, finalSlug, content, excerpt, thumbnail_url, category_id, status, id]);
        else {
            await db.run("INSERT INTO blog_posts (title, slug, content, excerpt, thumbnail_url, category_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)", [title, finalSlug, content, excerpt, thumbnail_url, category_id, status]);
            postId = (await db.findOne("SELECT id FROM blog_posts WHERE slug=?", [finalSlug])).id;
        }
        if (postId) {
            await db.run("DELETE FROM blog_post_tags WHERE post_id = ?", [postId]);
            const tagList = (tags || '').split(',').map((t: string) => t.trim()).filter((t: string) => t);
            for (const tName of tagList) {
                const tSlug = tName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                await db.run("INSERT OR IGNORE INTO blog_tags (name, slug) VALUES (?, ?)", [tName, tSlug]);
                const tagId = (await db.findOne("SELECT id FROM blog_tags WHERE slug=?", [tSlug])).id;
                await db.run("INSERT OR IGNORE INTO blog_post_tags (post_id, tag_id) VALUES (?, ?)", [postId, tagId]);
            }
        }
        return c.json({ success: true });
    });

    app.post('/admin/blog/delete', async (c) => {
        const { id } = await c.req.json();
        const db = getDb(c);
        await db.run("DELETE FROM blog_posts WHERE id = ?", [id]);
        await db.run("DELETE FROM blog_post_tags WHERE post_id = ?", [id]);
        return c.json({ success: true });
    });

    // Categories
    app.get('/admin/blog/categories', async (c) => renderAdmin(c, 'Categories', adminCategoriesHtml.replace('{{categories_data}}', JSON.stringify(await getDb(c).findAll("SELECT * FROM blog_categories ORDER BY name ASC")))));
    app.post('/admin/blog/categories/save', async (c) => {
        const { id, name, slug, description } = await c.req.json();
        const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const db = getDb(c);
        if (id) await db.run("UPDATE blog_categories SET name=?, slug=?, description=? WHERE id=?", [name, finalSlug, description, id]);
        else await db.run("INSERT INTO blog_categories (name, slug, description) VALUES (?, ?, ?)", [name, finalSlug, description]);
        return c.json({ success: true });
    });

    // Tags
    app.get('/admin/blog/tags', async (c) => renderAdmin(c, 'Tags', adminTagsHtml.replace('{{tags_data}}', JSON.stringify(await getDb(c).findAll("SELECT * FROM blog_tags ORDER BY name ASC")))));
    
    // Menus (Blog Specific Header)
    app.get('/admin/blog/menus', async (c) => renderAdmin(c, 'Menu Manager', adminMenusHtml.replace('{{menus_data}}', JSON.stringify(await getDb(c).findAll("SELECT * FROM blog_menus ORDER BY sort_order ASC")))));
    app.post('/admin/blog/menus/save', async (c) => {
        const { id, parent_id, title, url, sort_order } = await c.req.json();
        const db = getDb(c);
        if (id) await db.run("UPDATE blog_menus SET parent_id=?, title=?, url=?, sort_order=? WHERE id=?", [parent_id || null, title, url, sort_order, id]);
        else await db.run("INSERT INTO blog_menus (parent_id, title, url, sort_order) VALUES (?, ?, ?, ?)", [parent_id || null, title, url, sort_order]);
        return c.json({ success: true });
    });

    // Widgets
    app.get('/admin/blog/widgets', async (c) => renderAdmin(c, 'Widget Manager', adminWidgetsHtml.replace('{{widgets_data}}', JSON.stringify(await getDb(c).findAll("SELECT * FROM blog_widgets ORDER BY sort_order ASC")))));
    app.post('/admin/blog/widgets/save', async (c) => {
        const { id, title, type, content, sort_order, is_active } = await c.req.json();
        const db = getDb(c);
        if (id) await db.run("UPDATE blog_widgets SET title=?, type=?, content=?, sort_order=?, is_active=? WHERE id=?", [title, type, content, sort_order, is_active ? 1 : 0, id]);
        else await db.run("INSERT INTO blog_widgets (title, type, content, sort_order, is_active) VALUES (?, ?, ?, ?, ?)", [title, type, content, sort_order, is_active ? 1 : 0]);
        return c.json({ success: true });
    });
    app.post('/admin/blog/widgets/reorder', async (c) => {
        const { orders } = await c.req.json();
        const db = getDb(c);
        for (const item of orders) { await db.run("UPDATE blog_widgets SET sort_order = ? WHERE id = ?", [item.sort_order, item.id]); }
        return c.json({ success: true });
    });

    // [LOG END]
    Registry.log("Blog Manager Mounted Successfully [OK]");
}