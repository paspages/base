import { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { Database } from './database';

/**
 * STORAGE INTERFACE
 * Contract for all storage adapters.
 */
interface IStorageDriver {
    upload(file: File, path: string): Promise<string>;
}

/**
 * R2 ADAPTER
 * Native Cloudflare Object Storage.
 */
class R2Adapter implements IStorageDriver {
    constructor(private bucket?: R2Bucket) {}

    async upload(file: File, path: string): Promise<string> {
        if (!this.bucket) {
            throw new Error("R2 Bucket is not bound in wrangler.toml");
        }
        await this.bucket.put(path, file);
        return path;
    }
}

/**
 * CLOUDINARY ADAPTER
 * Uses unsigned upload presets.
 */
class CloudinaryAdapter implements IStorageDriver {
    constructor(private cloudName: string, private preset: string) {}

    async upload(file: File, path: string): Promise<string> {
        if (!this.cloudName || !this.preset) {
            throw new Error("Cloudinary credentials missing in Settings.");
        }
        
        const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/auto/upload`;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', this.preset);
        // Remove file extension for public_id to allow Cloudinary to handle formats
        formData.append('public_id', path.replace(/\.[^/.]+$/, ""));

        const res = await fetch(url, { method: 'POST', body: formData });
        const data = await res.json() as any;
        
        if (!res.ok) {
            throw new Error(`Cloudinary Error: ${data.error?.message}`);
        }
        return data.secure_url;
    }
}

/**
 * GOOGLE DRIVE ADAPTER
 * Uploads via REST API. Requires a valid Access Token.
 */
class GoogleDriveAdapter implements IStorageDriver {
    constructor(private token: string, private folderId: string) {}

    async upload(file: File, path: string): Promise<string> {
        if (!this.token) {
            throw new Error("Google Drive Access Token missing in Settings.");
        }
        
        const metadata = {
            name: path,
            parents: this.folderId ? [this.folderId] : []
        };
        
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + this.token },
            body: form
        });
        
        if (!res.ok) {
            throw new Error("Google Drive Upload Failed");
        }
        const data = await res.json() as any;
        return data.id;
    }
}

/**
 * STORAGE MANAGER (FACTORY)
 * Dynamically instantiates the correct driver based on Database Settings.
 */
export class StorageManager {
    private db: Database;
    private r2Bucket?: R2Bucket;

    constructor(d1: D1Database, r2?: R2Bucket) {
        this.db = new Database(d1);
        this.r2Bucket = r2;
    }

    /**
     * Resolves the active driver configuration from the database.
     */
    private async getActiveDriver(): Promise<IStorageDriver> {
        // Fetch all storage-related settings
        const settings = await this.db.findAll("SELECT key, value FROM core_settings WHERE group_name='storage'");
        
        // Map settings to a key-value object
        const config: Record<string, string> = {};
        settings.forEach((row: any) => config[row.key] = row.value);

        const driver = config['storage_driver'] || 'r2';

        switch (driver) {
            case 'cloudinary':
                return new CloudinaryAdapter(config['cloudinary_cloud_name'], config['cloudinary_upload_preset']);
            
            case 'googledrive':
                return new GoogleDriveAdapter(config['gdrive_access_token'], config['gdrive_folder_id']);
            
            case 'r2':
            default:
                return new R2Adapter(this.r2Bucket);
        }
    }

    /**
     * Uploads a file using the configured driver.
     * @param file - The File object
     * @param path - The destination path/filename
     */
    async upload(file: File, path: string): Promise<string> {
        const driver = await this.getActiveDriver();
        return await driver.upload(file, path);
    }
}
