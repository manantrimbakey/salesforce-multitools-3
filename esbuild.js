const { execFileSync, execSync } = require('child_process');
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

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

const clientBuilder = {
    name: 'client-builder',

    setup(build) {
        build.onStart(() => {
            if (watch) {
                console.log('[watch] client build started');

                const watcher = chokidar.watch(`./client`, {
                    ignored: ['client/node_modules'],
                });

                console.log(`path ${path.join(__dirname, 'client', 'src', '**', '*')}`);
                // console.log(`watcher ${watcher.getWatched()}`);

                const watchedArtifacts = watcher.getWatched() || [];

                for (let index = 0; index < watchedArtifacts.length; index++) {
                    const element = watchedArtifacts[index];
                    console.log(`${element}`);
                }

                const handleFilesChange = (event) => {
                    console.log(`[watch] client file changed: ${JSON.stringify(event)}`);
                    execSync('npm run build:client', { stdio: 'inherit' });
                    console.log('[watch] client build finished');
                };

                // watcher.on('change', handleFilesChange);
                // watcher.on('addDir', handleFilesChange);
                // watcher.on('', handleFilesChange);
                watcher.on('ready', handleFilesChange);

                watcher.on('change', handleFilesChange);
            }
        });
    },
};

// const clientBuilder = function() {
//     return new Promise((resolve, reject) => {
//         execSync('npm run build:client', { stdio: 'inherit' });
//         resolve();
//     });
// };

// /**
//  * @type {import('esbuild').Plugin}
//  */
// const copyWebviewsPlugin = {
//     name: 'copy-webviews',

//     setup(build) {
//         build.onEnd( async () => {
//             await clientBuilder();

//             // Ensure the webview-dist directory exists
//             const webviewDist = path.join(__dirname, 'dist', 'webview');
//             if (!fs.existsSync(webviewDist)) {
//                 fs.mkdirSync(webviewDist, { recursive: true });
//             }

//             // Copy the client build output to the webview-dist directory
//             const clientBuildDir = path.join(__dirname, 'client', 'dist');
//             if (fs.existsSync(clientBuildDir)) {
//                 copyDirectory(clientBuildDir, webviewDist);
//                 console.log('✓ Copied React webview files to dist/webview');
//             } else {
//                 console.warn('! Client build directory not found. Have you run npm run build:client?');
//             }
//         });
//     },
// };

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
        mainFields: ['module', 'main'],
        plugins: [
            /* add to the end of plugins array */
            esbuildProblemMatcherPlugin,
            // copyWebviewsPlugin,
            clientBuilder,
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
