import * as fs from 'fs';
import * as path from 'path';

/**
 * MODULE GENERATOR
 * Automatically scans the filesystem for plugins and themes,
 * generating a central registry file for the core loader.
 */

const PATHS = {
    plugins: path.join(process.cwd(), 'src/plugins'),
    themes: path.join(process.cwd(), 'src/themes'),
    output: path.join(process.cwd(), 'src/modules.gen.ts')
};

function generate(): void {
    let imports = "// AUTOMATICALLY GENERATED FILE - DO NOT EDIT\n";
    const moduleList: string[] = [];

    // Helper to scan directories
    const scan = (dirPath: string, prefix: string): void => {
        if (!fs.existsSync(dirPath)) return;

        const folders = fs.readdirSync(dirPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory());

        folders.forEach((folder, index) => {
            const alias = `${prefix}${index}`;
            const relativePath = path.relative(path.dirname(PATHS.output), path.join(dirPath, folder.name));
            
            // Normalize path for Windows/Linux consistency
            const normalizedPath = `./${relativePath.replace(/\\/g, '/')}/index`;
            
            imports += `import * as ${alias} from '${normalizedPath}';\n`;
            moduleList.push(alias);
        });
    };

    // Execute scans
    scan(PATHS.plugins, 'p');
    scan(PATHS.themes, 't');

    const content = `${imports}\nexport const modules = [\n    ${moduleList.join(',\n    ')}\n];\n`;

    fs.writeFileSync(PATHS.output, content);
    console.log(`\x1b[32m✨ [Discovery] Generated ${moduleList.length} modules into ${path.basename(PATHS.output)}\x1b[0m`);
}

// Global error handling for the build tool
try {
    generate();
} catch (error) {
    console.error(`\x1b[31m[Critical] Module generation failed: ${error}\x1b[0m`);
    process.exit(1);
}