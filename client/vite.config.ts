import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: '../dist/webview',
        assetsDir: 'assets',
        emptyOutDir: true,
        sourcemap: false,

        rollupOptions: {
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name].[ext]',
                // One vendor chunk: splitting react / mui / emotion into separate chunks creates circular
                // chunk imports ("Cannot access 'x' before initialization"). Icons and the virtualizer stay
                // with the lazy feature chunks; they only depend on vendor, never the other way round.
                manualChunks(id) {
                    if (!id.includes('node_modules')) return undefined;
                    if (/[\\/]node_modules[\\/](@mui[\\/]icons-material|@tanstack)[\\/]/.test(id)) return undefined;
                    return 'vendor';
                },
            },
        },
    },
    base: './', // Ensures assets are loaded correctly in VS Code webview
});
