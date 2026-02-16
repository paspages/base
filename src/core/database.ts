import { D1Database } from '@cloudflare/workers-types';

/**
 * Database Wrapper for Cloudflare D1
 * Provides a unified interface for executing SQL queries with multi-statement support.
 */
export class Database {
    private db: D1Database;

    constructor(db: D1Database) {
        this.db = db;
    }

    /**
     * Internal helper to split a SQL string into individual statements.
     */
    private splitStatements(sql: string): string[] {
        return sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);
    }

    /**
     * Executes multiple SQL statements in a single batch.
     * Handles the discrepancy between D1 exec() and batch() result formats.
     */
    async raw(sql: string) {
        if (!sql || sql.trim() === '') {
            return { count: 0, duration: 0 };
        }

        try {
            const statements = this.splitStatements(sql);
            
            // Single Statement Execution
            if (statements.length === 1) {
                const res = await this.db.exec(statements[0]);
                // D1 exec result has duration at root level
                return {
                    count: 1,
                    duration: res?.duration || 0,
                    success: true
                };
            }

            // Multiple Statements Execution via Batch
            const batchPrepared = statements.map(stmt => this.db.prepare(stmt));
            const batchResults = await this.db.batch(batchPrepared);
            
            // Calculate total duration safely using optional chaining
            const totalDuration = batchResults.reduce((acc, curr) => {
                const stepDuration = curr?.meta?.duration || 0;
                return acc + stepDuration;
            }, 0);
            
            return {
                count: batchResults.length,
                duration: totalDuration,
                success: true
            };

        } catch (e: any) {
            console.error('[Database] Raw execution error:', e.message);
            // Return standardized error object
            return { 
                count: 0, 
                duration: 0, 
                success: false, 
                error: e.message 
            };
        }
    }

    /**
     * Fetch a single record from the database.
     */
    async findOne<T = any>(query: string, params: any[] = []): Promise<T | null> {
        try {
            const stmt = this.db.prepare(query).bind(...params);
            return await stmt.first<T>();
        } catch (e) {
            return null;
        }
    }

    /**
     * Fetch all matching records from the database.
     */
    async findAll<T = any>(query: string, params: any[] = []): Promise<T[]> {
        try {
            const stmt = this.db.prepare(query).bind(...params);
            const { results } = await stmt.all<T>();
            return results || [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Standard write operation (INSERT, UPDATE, DELETE).
     */
    async run(query: string, params: any[] = []) {
        try {
            const res = await this.db.prepare(query).bind(...params).run();
            // Ensure meta compatibility
            if (!res.meta) {
                // @ts-ignore
                res.meta = { duration: 0, changes: 0, last_row_id: 0, served_by: 'shim' };
            }
            return res;
        } catch (e: any) {
            throw new Error(`Database run error: ${e.message}`);
        }
    }
}