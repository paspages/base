import { D1Database } from '@cloudflare/workers-types';
import { Database } from './database';

/**
 * Migration Engine
 * Manages database schema updates and tracking.
 */
export class Migrator {
    private db: Database;

    constructor(d1: D1Database) {
        this.db = new Database(d1);
    }

    /**
     * Ensures the internal migrations tracking table exists.
     */
    async initSystem() {
        try {
            await this.db.run(`
                CREATE TABLE IF NOT EXISTS _migrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    slug TEXT NOT NULL,
                    version TEXT NOT NULL,
                    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(slug, version)
                );
            `);
        } catch (e: any) {
            throw new Error(`Migration System Init Failed: ${e.message}`);
        }
    }

    /**
     * Applies a migration and records its completion status.
     */
    async applyMigration(slug: string, version: string, sql: string): Promise<string> {
        try {
            // 1. Check if already applied
            const exists = await this.db.findOne(
                "SELECT id FROM _migrations WHERE slug = ? AND version = ?", 
                [slug, version]
            );

            if (exists) {
                return `[SKIP] ${slug} v${version} is already applied.`;
            }

            // 2. Execute SQL via the updated Database.raw method
            const result: any = await this.db.raw(sql);

            // 3. Verify execution success
            if (result && result.success === false) {
                return `[ERROR] SQL Execution failed for ${slug} v${version}: ${result.error || 'Unknown error'}`;
            }

            // 4. Extract duration safely
            const duration = result?.duration || 0;
            
            // 5. Register migration only after verified success
            await this.db.run(
                "INSERT INTO _migrations (slug, version) VALUES (?, ?)", 
                [slug, version]
            );

            return `[SUCCESS] ${slug} v${version} applied in ${duration.toFixed(4)}ms`;

        } catch (e: any) {
            console.error(`[Migrator] Fatal error during ${slug} migration:`, e);
            return `[ERROR] Fatal failure for ${slug}: ${e.message}`;
        }
    }
}