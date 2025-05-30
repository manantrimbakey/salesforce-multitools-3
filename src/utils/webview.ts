import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './logger';
import { ExpressServer } from './expressServer';

/**
 * Helper class for working with webviews in VS Code extensions
 */
export class WebviewUtils {
    /**
     * Get the HTML content for a webview panel, including the bundled React app
     * @param webview The webview to get HTML for
     * @param extensionPath The path to the extension
     * @param webviewPath Path to the webview relative to the extension's dist/webview folder
     * @returns HTML content for the webview
     */
    public static getWebviewContent(webview: vscode.Webview, extensionPath: string, webviewPath: string = ''): string {
        // Path to the webview resources
        const webviewResourcesPath = path.join(extensionPath, 'dist', 'webview');

        // Check if the webview resources exist
        if (!fs.existsSync(webviewResourcesPath)) {
            // Try to use client/dist for dev mode
            const clientDistPath = path.join(extensionPath, 'client', 'dist');

            if (fs.existsSync(clientDistPath)) {
                Logger.debug(`Using client/dist for webview instead of dist/webview`);
                return this.getHtmlFromPath(webview, extensionPath, clientDistPath, webviewPath);
            }

            // Finally check for client/public
            const clientPublicPath = path.join(extensionPath, 'client', 'public');

            if (fs.existsSync(clientPublicPath)) {
                Logger.debug(`Using client/public for webview during development`);
                return this.getHtmlFromPath(webview, extensionPath, clientPublicPath, webviewPath);
            }

            return `
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Error</title>
                </head>
                <body>
                    <h1>Error</h1>
                    <p>Webview resources not found. Make sure to run 'npm run build:client' first.</p>
                </body>
                </html>
            `;
        }

        return this.getHtmlFromPath(webview, extensionPath, webviewResourcesPath, webviewPath);
    }

    /**
     * Get HTML content from a specific path
     */
    private static getHtmlFromPath(
        webview: vscode.Webview,
        extensionPath: string,
        basePath: string,
        webviewPath: string,
    ): string {
        // Find the main HTML file
        const htmlPath = path.join(basePath, webviewPath, 'index.html');

        if (!fs.existsSync(htmlPath)) {
            return `
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Error</title>
                </head>
                <body>
                    <h1>Error</h1>
                    <p>Webview HTML file not found at ${htmlPath}.</p>
                </body>
                </html>
            `;
        }

        // Read the HTML file
        let html = fs.readFileSync(htmlPath, 'utf8');

        // Get the base directory for assets
        const baseDir = path.join(basePath, webviewPath);

        // Replace links to assets with VS Code webview URIs
        html = this.replaceAssetPaths(html, webview, extensionPath, baseDir);

        // Add the server connection script
        html = this.addServerConnectionScript(html);

        return html;
    }

    /**
     * Replace asset paths in HTML with VS Code webview URIs
     */
    private static replaceAssetPaths(
        html: string,
        webview: vscode.Webview,
        extensionPath: string,
        baseDir: string,
    ): string {
        // Replace paths in script tags
        html = html.replace(/<script([^>]*) src="([^"]+)"/g, (match, attrs, src) => {
            // Skip external URLs
            if (src.startsWith('http://') || src.startsWith('https://')) {
                return match;
            }

            const assetPath = path.join(baseDir, src);
            const vscodeUri = webview.asWebviewUri(vscode.Uri.file(assetPath)).toString();
            return `<script${attrs} src="${vscodeUri}"`;
        });

        // Replace paths in link tags
        html = html.replace(/<link([^>]*) href="([^"]+)"/g, (match, attrs, href) => {
            // Skip external URLs
            if (href.startsWith('http://') || href.startsWith('https://')) {
                return match;
            }

            const assetPath = path.join(baseDir, href);
            const vscodeUri = webview.asWebviewUri(vscode.Uri.file(assetPath)).toString();
            return `<link${attrs} href="${vscodeUri}"`;
        });

        // Replace paths in image tags
        html = html.replace(/<img([^>]*) src="([^"]+)"/g, (match, attrs, src) => {
            // Skip data URLs and external URLs
            if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
                return match;
            }

            const assetPath = path.join(baseDir, src);
            const vscodeUri = webview.asWebviewUri(vscode.Uri.file(assetPath)).toString();
            return `<img${attrs} src="${vscodeUri}"`;
        });

        // Add CSP meta tag to allow VS Code webview URIs and Express server
        const csp = this.getCSPMetaTag(webview);

        // Add the CSP meta tag to the head
        html = html.replace('</head>', `${csp}</head>`);

        return html;
    }

    /**
     * Add server connection script to the HTML content
     */
    private static addServerConnectionScript(html: string): string {
        // Generate the server connection script
        const script = this.getServerConnectionScript();

        // Add the script right before the closing body tag
        return html.replace('</body>', `${script}</body>`);
    }

    /**
     * Get the Content Security Policy meta tag with proper server permissions
     */
    private static getCSPMetaTag(webview: vscode.Webview): string {
        let connectSrc = `${webview.cspSource} https:`;

        // Add the Express server origin to connect-src if server is running
        const server = ExpressServer.getInstance();
        if (server.isRunning()) {
            const url = new URL(server.getBaseUrl());
            connectSrc = `${webview.cspSource} ${url.origin} https: wss: data:`;
            Logger.debug(`Added Express server origin ${url.origin} to CSP`);
        }

        return `
            <meta
                http-equiv="Content-Security-Policy"
                content="default-src 'none';
                        img-src ${webview.cspSource} https: data:;
                        script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval';
                        style-src ${webview.cspSource} https://fonts.googleapis.com 'unsafe-inline';
                        font-src ${webview.cspSource} https://fonts.gstatic.com;
                        connect-src ${connectSrc};"
            />
        `;
    }

    /**
     * Generate script to connect to the Express server
     */
    private static getServerConnectionScript(): string {
        const server = ExpressServer.getInstance();
        if (!server.isRunning()) {
            return `
            <script>
            // Server not available
            </script>
            `;
        }

        const serverUrl = server.getBaseUrl();
        const extensionToken = 'vscode-salesforce-multitools-' + process.pid;

        return `
        <script>
        // Server connection info
        window.serverBaseUrl = "${serverUrl}";
        window.extensionToken = "${extensionToken}";

        // Utility function to make API calls to the Express server
        window.callServerApi = async (endpoint, method = 'GET', data = null) => {
            const url = window.serverBaseUrl + endpoint;
            try {
                const options = {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-VSCode-Extension-Token': window.extensionToken
                    }
                };
                
                if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                    options.body = JSON.stringify(data);
                }
                
                const response = await fetch(url, options);
                if (!response.ok) {
                    throw new Error('API call failed: ' + response.status);
                }
                return await response.json();
            } catch (error) {
                // Error handled silently for security
                throw error;
            }
        };
        </script>
        `;
    }
}
