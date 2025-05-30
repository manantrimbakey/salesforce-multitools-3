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
        // minify: 'terser',
        // cssMinify: `esbuild`,

        rollupOptions: {
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name].[ext]',
                // manualChunks(id) {
                //     if (id.includes('node_modules')) {
                //         return 'vendor';
                //     }
                // },
            },
        },
    },
    base: './', // Ensures assets are loaded correctly in VS Code webview
});
