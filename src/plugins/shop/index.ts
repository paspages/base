import { Hono } from 'hono';
import { Registry } from '../../core/registry';
import { Database } from '../../core/database';
import { AppEnv } from '../../../hono.config';
import { renderAdmin } from '../../admin/routes';

/**
 * SHOP PLUGIN MANIFEST
 * Defines module metadata and requirements.
 */
export const manifest = {
    slug: 'shop-core',
    name: 'PasPages Shop',
    version: '1.0.1', // Bumped version to ensure a fresh migration check
    type: 'plugin' as const,
    description: 'Core e-commerce functionality for products and inventory management.',
    requires: '1.0.0'
};

/**
 * DATABASE SCHEMA
 * FIX: Removed the trailing semicolon and extra whitespace.
 * This ensures the Database batch processor doesn't create an empty statement 
 * that returns an 'undefined' result.
 */
const shopSchema = `
    CREATE TABLE IF NOT EXISTS shop_products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        price REAL DEFAULT 0,
        stock INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`;

/**
 * PLUGIN ENTRY POINT
 * Initializes routes, menus, and database schemas.
 */
export default function(app: Hono<AppEnv>) {
    // 1. Register Module Resources
    Registry.registerSchema(manifest.slug, manifest.version, shopSchema);

    // 2. Register Sidebar Menu Item
    Registry.registerMenu({
        title: 'shop_manager',
        path: '/admin/shop',
        category: 'plugin',
        icon: 'shopping-cart'
    });

    // 3. Register English & Indonesian Translations
    Registry.registerTranslation('en', {
        'shop_manager': 'Shop Manager',
        'product_list': 'Product List',
        'add_product': 'Add Product',
        'price': 'Price',
        'stock': 'Stock',
        'no_products': 'No products found.'
    });

    Registry.registerTranslation('id', {
        'shop_manager': 'Manajemen Toko',
        'product_list': 'Daftar Produk',
        'add_product': 'Tambah Produk',
        'price': 'Harga',
        'stock': 'Stok',
        'no_products': 'Data produk kosong.'
    });

    // 4. Shop Administration Routes
    const shop = new Hono<AppEnv>();

    /**
     * Main Shop Dashboard Route
     * Fetches products and renders them inside the Admin Shell.
     */
    shop.get('/', async (c) => {
        const db = new Database(c.env.CORE_DB);
        const locale = (c.get('locale') as string) || 'en';
        
        // Fetch all products from D1
        const products = await db.findAll("SELECT * FROM shop_products ORDER BY created_at DESC");
        
        // Generate table rows dynamically
        let productRows = (products || []).map(p => `
            <tr style="border-bottom: 1px solid #222;">
                <td style="padding: 12px 0; font-size: 14px;">${p.name}</td>
                <td style="padding: 12px 0; font-size: 14px;">$${p.price}</td>
                <td style="padding: 12px 0; font-size: 14px;">${p.stock}</td>
                <td style="padding: 12px 0; text-align: right;">
                    <button style="background: #333; color: #fff; border: 1px solid #444; padding: 5px 12px; cursor: pointer; border-radius: 4px; font-size: 12px;">Edit</button>
                </td>
            </tr>
        `).join('');

        // Handle empty state using translation registry
        if (!products || products.length === 0) {
            productRows = `<tr><td colspan="4" style="text-align: center; padding: 40px; color: #666; font-style: italic;">${Registry.getTranslation(locale, 'no_products')}</td></tr>`;
        }

        /**
         * HTML CONTENT FRAGMENT
         */
        const pageContent = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px;">
                <h2 style="margin: 0; font-weight: 800; letter-spacing: -0.025em;">${Registry.getTranslation(locale, 'product_list')}</h2>
                <button style="background: var(--accent); color: #000; border: none; padding: 10px 20px; font-weight: 900; border-radius: 6px; cursor: pointer; text-transform: uppercase; font-size: 12px; letter-spacing: 0.05em;">
                    + ${Registry.getTranslation(locale, 'add_product')}
                </button>
            </div>

            <div class="card" style="background: #111; border: 1px solid var(--border); border-radius: 12px; padding: 24px;">
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="color: #444; font-size: 0.75rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.1em; border-bottom: 1px solid var(--border);">
                            <th style="padding-bottom: 15px;">Product Name</th>
                            <th style="padding-bottom: 15px;">${Registry.getTranslation(locale, 'price')}</th>
                            <th style="padding-bottom: 15px;">${Registry.getTranslation(locale, 'stock')}</th>
                            <th style="padding-bottom: 15px; text-align: right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${productRows}
                    </tbody>
                </table>
            </div>
        `;

        // Render via shared layout helper
        return await renderAdmin(c, Registry.getTranslation(locale, 'shop_manager'), pageContent);
    });

    // Mount the shop routes
    // FIX: Using root mount inside the plugin so it correctly inherits the prefix from app.ts
    app.route('/', shop);
}