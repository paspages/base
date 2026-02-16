import { CONFIG } from '../../hono.config';
import { ModuleManifest } from './types';

export class Validator {
    /**
     * Validates a loaded module against the STRICT system requirements.
     * If a module does not define 'requires', it is considered INVALID (Strict Mode).
     */
    static validate(module: any, type: 'plugin' | 'theme') {
        // 1. Basic Integrity Check
        if (!module || !module.manifest) {
            return { isValid: false, error: 'Manifest is missing or module is undefined' };
        }

        const manifest = module.manifest as ModuleManifest;
        const { slug, version, type: mType, requires } = manifest;

        // 2. Structure Validation
        if (!slug || !version) {
            return { isValid: false, error: `Invalid manifest structure in ${slug || 'unknown'}` };
        }

        // 3. Type Consistency Check
        if (mType !== type) {
            return { isValid: false, error: `Type mismatch for ${slug}. Expected ${type}, got ${mType}` };
        }

        // 4. STRICT VERSION CHECK (The Fix)
        // Instead of crashing, we explicitly check if 'requires' exists.
        // If it's missing, we REJECT the plugin because we are in Strict Mode.
        if (!requires) {
            return { isValid: false, error: `STRICT MODE: Module ${slug} MUST define 'requires' version.` };
        }

        // 5. Compatibility Check
        // Now it is safe to call isCompatible because we know 'requires' exists.
        if (!this.isCompatible(requires)) {
            return { isValid: false, error: `Incompatible Version. ${slug} requires v${requires}, Core is v${CONFIG.CORE_VERSION}` };
        }

        return { isValid: true };
    }

    /**
     * Checks if the required version matches the current Core Version.
     * Logic: Strict Major Version Match.
     */
    static isCompatible(requiredVersion: string): boolean {
        try {
            // We can safely split now because validate() guarantees the string exists
            const coreParts = CONFIG.CORE_VERSION.split('.');
            const reqParts = requiredVersion.split('.');

            const coreMajor = parseInt(coreParts[0]);
            const reqMajor = parseInt(reqParts[0]);

            // Strict Major version match
            return coreMajor === reqMajor;

        } catch (e) {
            console.error('[Validator] Version parsing failed');
            return false; // Fail safe: If version string is garbage, reject it.
        }
    }
}