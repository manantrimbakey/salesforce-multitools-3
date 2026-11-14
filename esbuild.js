const esbuild = require('esbuild');

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
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            });
            console.log('[watch] build finished');
        });
    },
};

/**
 * `@salesforce/core` (with jsforce) is about 70% of the bundle, but only needed once an org
 * connection is requested. It is built into its own file and loaded with a lazy require, so
 * activation only parses the small extension bundle.
 *
 * @type {import('esbuild').Plugin}
 */
const lazySfCorePlugin = {
    name: 'lazy-sfcore',
    setup(build) {
        build.onResolve({ filter: /^@salesforce\/core$/ }, () => ({ path: './sfcore.js', external: true }));
    },
};

const common = {
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    logLevel: 'silent',
    mainFields: ['module', 'main'],
    metafile: production,
};

// The React webview is built separately (`pnpm run build:client`, or `vite build --watch` via `watch:client`).
async function main() {
    const contexts = await Promise.all([
        esbuild.context({
            ...common,
            entryPoints: ['src/extension.ts'],
            outfile: 'dist/extension.js',
            external: ['vscode'],
            plugins: [lazySfCorePlugin, esbuildProblemMatcherPlugin],
        }),
        esbuild.context({
            ...common,
            stdin: { contents: "module.exports = require('@salesforce/core');", resolveDir: __dirname },
            outfile: 'dist/sfcore.js',
            plugins: [esbuildProblemMatcherPlugin],
        }),
    ]);
    if (watch) {
        await Promise.all(contexts.map((ctx) => ctx.watch()));
        return;
    }

    const results = await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));

    if (production) {
        for (const result of results) {
            if (result.metafile) {
                console.log(await esbuild.analyzeMetafile(result.metafile, { color: false }));
            }
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
