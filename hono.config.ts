import { KVNamespace, R2Bucket, D1Database, Fetcher } from '@cloudflare/workers-types';

/**
 * Global Configuration & Types
 */
export type Bindings = {
  // Storage & Database
  CORE_KV: KVNamespace;
  CORE_BUCKET: R2Bucket;
  CORE_DB: D1Database; // Persistence Layer

  // Security Secrets
  MASTER_KEY: string;  // Emergency Access
  JWT_SECRET: string;  // Session/Auth Token Signature

  // Environment
  ENVIRONMENT: 'development' | 'production';
  
  // Cloudflare Pages Specific
  // MANDATORY: Required to fetch static assets (images, css) via Worker
  ASSETS: Fetcher;
}

export type Variables = {
  startTime: number;
  locale: 'en' | 'id';
  
  // Auth Session Data
  // Stores decoded user info after JWT verification middleware
  jwtPayload?: {
    sub: string; // Subject (User ID/Email)
    role: string; // admin, editor, etc.
    exp: number; // Expiration time
  };
}

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
}

export const CONFIG = {
  CORE_VERSION: '1.0.0', // Version Lock for Plugins
  corsOrigin: '*',
  defaultLocale: 'en' as const
};