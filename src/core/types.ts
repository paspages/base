import { Context, Hono } from 'hono';

export interface ModuleManifest {
    type: 'plugin' | 'theme';
    slug: string;
    name: string;
    version: string;
    author: string;
    minCoreVersion: string;
}

export interface PasPagesModule {
    manifest: ModuleManifest;
    default: (app: Hono) => void;
}

export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

export interface AdminMenuItem {
    title: string;
    path: string;
    category: 'plugin' | 'theme' | 'core';
}

export interface MigrationSchema {
    slug: string;
    version: string;
    sql: string;
}
