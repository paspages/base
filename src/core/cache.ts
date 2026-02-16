import { KVNamespace, KVNamespacePutOptions } from '@cloudflare/workers-types';

export class CacheManager {
  private kv?: KVNamespace;

  constructor(kv?: KVNamespace) {
    this.kv = kv;
    if (!kv) {
        console.warn("[Cache] CORE_KV binding not found. Caching is disabled.");
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.kv) return null;
    const data = await this.kv.get(key, 'json');
    return data as T | null;
  }

  async put(key: string, value: any, ttl?: number): Promise<void> {
    if (!this.kv) return;
    const options: KVNamespacePutOptions = ttl ? { expirationTtl: ttl } : {};
    await this.kv.put(key, JSON.stringify(value), options);
  }

  async delete(key: string): Promise<void> {
    if (!this.kv) return;
    await this.kv.delete(key);
  }
}
