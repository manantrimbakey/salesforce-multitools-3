const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',

    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                console.error(`    ${location.file}:${location.line}:${location.column}:`);
            });
            console.log('[watch] build finished');
        });
    },
};

/**
 * @type {import('esbuild').Plugin}
 */
const copyWebviewsPlugin = {
    name: 'copy-webviews',

    setup(build) {
        build.onEnd(() => {
            // Ensure the webview-dist directory exists
            const webviewDist = path.join(__dirname, 'dist', 'webview');
            if (!fs.existsSync(webviewDist)) {
                fs.mkdirSync(webviewDist, { recursive: true });
            }
            
            // Copy the client build output to the webview-dist directory
            const clientBuildDir = path.join(__dirname, 'client', 'dist');
            if (fs.existsSync(clientBuildDir)) {
                copyDirectory(clientBuildDir, webviewDist);
                console.log('✓ Copied React webview files to dist/webview');
            } else {
                console.warn('! Client build directory not found. Have you run npm run build:client?');
            }
        });
    },
};

/**
 * Recursively copy a directory
 */
function copyDirectory(source, destination) {
    // Create the destination directory if it doesn't exist
    if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true });
    }

    // Read all files/directories in the source
    const entries = fs.readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(source, entry.name);
        const destPath = path.join(destination, entry.name);

        if (entry.isDirectory()) {
            // Recursively copy directories
            copyDirectory(srcPath, destPath);
        } else {
            // Copy files
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

async function main() {
    const ctx = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: production ? false : true,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [
            /* add to the end of plugins array */
            esbuildProblemMatcherPlugin,
            copyWebviewsPlugin,
        ],
    });
    if (watch) {
        await ctx.watch();
    } else {
        await ctx.rebuild();
        await ctx.dispose();
        
        // Remove map files in production build
        if (production) {
            const mapFile = path.join(__dirname, 'dist', 'extension.js.map');
            if (fs.existsSync(mapFile)) {
                fs.unlinkSync(mapFile);
                console.log('✓ Removed source map file for production build');
            }
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
