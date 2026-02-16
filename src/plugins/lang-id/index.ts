import { Hono } from 'hono';
import { Registry } from '../../core/registry';
import { ModuleManifest } from '../../core/types';

export const manifest: ModuleManifest = {
    type: 'plugin',
    slug: 'lang-id',
    name: 'Indonesian Language Pack',
    version: '1.0.0',
    author: 'PasPages Community',
    minCoreVersion: '1.0.0'
};

export default function(app: Hono) {
    // Inject Indonesian Translation via Registry
    Registry.registerTranslation('id', {
        'welcome': 'Selamat Datang di PasPages Core',
        'admin_title': 'Panel Admin',
        'status_operational': 'BERJALAN',
        'modules_active': 'Modul Aktif',
        'db_connected': 'Database Terhubung',
        'settings_saved': 'Pengaturan Berhasil Disimpan',
        'migration_run': 'Jalankan Migrasi Database',
        'system_health': 'Kesehatan Sistem',
        'quick_actions': 'Aksi Cepat'
    });

    console.log('[Lang] Indonesian language loaded.');
}
