import { Bindings } from '../../hono.config';

export class Security {
  private secret: string;

  constructor(env: Bindings) {
    this.secret = env.APP_SECRET || 'dev-unsafe-secret-key-CHANGE_ME_IN_PROD';
    if (!env.APP_SECRET && env.ENVIRONMENT === 'production') {
        console.error("[Security] CRITICAL: APP_SECRET is missing in Production!");
    }
  }

  private async getKey(): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.secret),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('paspages-core-salt'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encrypt(text: string): Promise<string> {
    const key = await this.getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encoder.encode(text)
    );

    const combined = new Uint8Array([...iv, ...new Uint8Array(encrypted)]);
    return btoa(String.fromCharCode(...combined));
  }

  async decrypt(cipherText: string): Promise<string | null> {
    try {
      const combined = Uint8Array.from(atob(cipherText), c => c.charCodeAt(0));
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);
      const key = await this.getKey();

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        data
      );

      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('[Security] Decryption Failed:', error);
      return null;
    }
  }
}
