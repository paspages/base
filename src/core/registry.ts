// Define interfaces inline to ensure zero-dependency errors
export interface AdminMenuItem {
    title: string;
    path: string;
    category: 'plugin' | 'theme' | 'settings';
    icon?: string;
    order?: number;
}

export interface MigrationSchema {
    slug: string;
    version: string;
    sql: string;
    schema?: string; // Compatibility alias
}

/**
 * CORE REGISTRY SYSTEM
 * Acts as the central "Guest Book" for the application.
 * Stores active menus, active themes, loaded plugins, migration schemas, and translations in memory.
 * This class uses the Singleton pattern via static methods to ensure global accessibility.
 */
export class Registry {
    // --- State Storage ---
    private static menus: AdminMenuItem[] = [];
    private static schemas: MigrationSchema[] = [];
    // Stores HTML templates. Format: "themeSlug:viewName" -> HTML
    private static templates: Record<string, string> = {}; 
    private static activeTheme: string = 'nebula'; // Default to nebula as requested
    private static pluginList: string[] = [];

    // NEW: System Logs Storage for Nebula Terminal
    private static systemLogs: string[] = [];

    // Translation Storage. Structure: { locale: { key: value } }
    private static translations: Record<string, Record<string, string>> = {
        en: {},
        id: {}
    };

    // =========================================================================
    // MENU MANAGEMENT
    // =========================================================================

    /**
     * Register a new menu item for the Admin Dashboard.
     * Plugins call this method during their initialization to inject sidebar items.
     */
    static registerMenu(menu: AdminMenuItem) {
        this.menus.push(menu);
    }

    /**
     * Retrieve menus filtered by category.
     * Used by the Admin View Engine to render the sidebar.
     */
    static getMenus(category?: 'plugin' | 'theme'): AdminMenuItem[] {
        if (category) {
            return this.menus.filter(m => m.category === category);
        }
        return this.menus;
    }

    // =========================================================================
    // MIGRATION MANAGEMENT
    // =========================================================================

    /**
     * Register a Database Schema for a Plugin/Theme.
     * This does NOT execute the SQL immediately. It queues it for the Admin Migration Tool.
     * @param slug - Module ID (e.g., 'shop-core')
     * @param version - Module Version (e.g., '1.0.0')
     * @param sql - Raw DDL (CREATE TABLE, etc.)
     */
    static registerSchema(slug: string, version: string, sql: string) {
        // We store 'schema' as an alias for 'sql' to ensure compatibility with all routers
        this.schemas.push({ slug, version, sql, schema: sql });
        // Log the event
        this.log(`Schema registered: ${slug} v${version}`);
    }

    /**
     * Retrieve all registered schemas.
     * Used by the Migrator Engine to apply updates.
     */
    static getSchemas(): MigrationSchema[] {
        return this.schemas;
    }

    /**
     * Retrieve a single schema by its slug.
     * Required by the Admin Setup route to initialize the core system.
     * @param slug - The unique identifier of the module (e.g., 'core-system')
     */
    static getSchema(slug: string): MigrationSchema | undefined {
        return this.schemas.find(s => s.slug === slug);
    }

    // =========================================================================
    // THEME MANAGEMENT
    // =========================================================================

    /**
     * getThemeView (Required for Blog Plugin Theme Engine)
     * Retrieves a specific template based on the theme slug and view name.
     * @param theme - The theme slug (e.g., 'nebula')
     * @param view - The view name (e.g., 'blog_index')
     */
    static getThemeView(theme: string, view: string): string | null {
        const key = `${theme}:${view}`;
        return this.templates[key] || null;
    }

    /**
     * Register a Theme Template (Raw HTML).
     * Used by themes (e.g., Nebula) to register their views.
     * @param theme - The theme slug (e.g. 'nebula')
     * @param view - The view name (e.g., 'landing')
     * @param html - The raw HTML string
     */
    static registerThemeView(theme: string, view: string, html: string) {
        this.templates[`${theme}:${view}`] = html;
        // Also register generic alias if needed by ViewEngine
        if (view === 'landing') {
             this.templates[`landing`] = html;
        }
    }

    /**
     * Register View Alias (Compatibility)
     * Some parts of the system might call registerView directly
     */
    static registerView(name: string, html: string) {
        this.templates[name] = html;
    }

    /**
     * Retrieve a specific view.
     * Tries exact match first, then theme-scoped match.
     * @param view - The view name (e.g., 'landing')
     */
    static getView(view: string): string | null {
        // Priority 1: Check if specific theme view exists (e.g. 'nebula:landing')
        const themeScoped = `${this.activeTheme}:${view}`;
        if (this.templates[themeScoped]) {
            return this.templates[themeScoped];
        }
        // Priority 2: Check direct name (e.g. 'landing')
        return this.templates[view] || null;
    }

    /**
     * Set the Active Theme (Runtime switch).
     * @param name - The theme slug
     */
    static setActiveTheme(name: string) {
        this.activeTheme = name;
        this.log(`Theme switched to: ${name}`);
    }

    /**
     * Get the name of the currently active theme.
     */
    static getActiveThemeName(): string {
        return this.activeTheme;
    }

    // =========================================================================
    // PLUGIN TRACKING
    // =========================================================================

    /**
     * Register a loaded plugin name for system status.
     * Prevents duplicate registration.
     */
    static registerPlugin(name: string) {
        if (!this.pluginList.includes(name)) {
            this.pluginList.push(name);
            this.log(`Plugin mounted: ${name}`);
        }
    }

    /**
     * Get the count of active plugins.
     */
    static getPluginCount(): number {
        return this.pluginList.length;
    }

    // =========================================================================
    // TRANSLATION MANAGEMENT (i18n)
    // =========================================================================

    /**
     * Register translations for a specific locale.
     * Merges with existing data, allowing plugins to add/override keys.
     * @param locale - Language code (e.g., 'en', 'id')
     * @param data - Key-Value pair object of strings
     */
    static registerTranslation(locale: string, data: Record<string, string>) {
        if (!this.translations[locale]) {
            this.translations[locale] = {};
        }
        // Merge logic: New keys overwrite old keys (allows plugins to customize core text)
        this.translations[locale] = { ...this.translations[locale], ...data };
    }

    /**
     * Retrieve a specific translation key.
     * @param locale - Language code
     * @param key - The translation key
     */
    static getTranslation(locale: string, key: string): string | null {
        return this.translations[locale]?.[key] || null;
    }

    /**
     * Retrieve all translations for a specific locale.
     * @param locale - Language code
     */
    static getTranslations(locale: string): Record<string, string> {
        return this.translations[locale] || {};
    }

    // =========================================================================
    // SYSTEM LOGGING (NEBULA TERMINAL)
    // =========================================================================

    /**
     * Log a system event with a timestamp.
     * This feeds the "Nebula Terminal" on the frontend.
     * @param message - The log message
     */
    static log(message: string) {
        const now = new Date();
        const time = now.toISOString().split('T')[1].split('.')[0]; // HH:MM:SS format
        const logEntry = `[${time}] ${message}`;
        
        this.systemLogs.push(logEntry);
        
        // Console output for backend debugging
        console.log(`[Nebula] ${message}`);
    }

    /**
     * Retrieve the system logs for display.
     */
    static getLogs(): string[] {
        return this.systemLogs;
    }
}