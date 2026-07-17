import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { Logger } from '../utils/logger';

export function getNonce() {
    return crypto.randomBytes(16).toString('base64');
}

export function getWebviewContent(webview: vscode.Webview, extensionPath: string, webviewPath: string = ''): string {
    const webviewResourcesPath = path.join(extensionPath, 'dist', 'webview');
    
    if (!fs.existsSync(webviewResourcesPath)) {
        const clientDistPath = path.join(extensionPath, 'client', 'dist');
        if (fs.existsSync(clientDistPath)) {
            Logger.debug(`Using client/dist for webview instead of dist/webview`);
            return getHtmlFromPath(webview, extensionPath, clientDistPath, webviewPath);
        }

        const clientPublicPath = path.join(extensionPath, 'client', 'public');
        if (fs.existsSync(clientPublicPath)) {
            Logger.debug(`Using client/public for webview during development`);
            return getHtmlFromPath(webview, extensionPath, clientPublicPath, webviewPath);
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

    return getHtmlFromPath(webview, extensionPath, webviewResourcesPath, webviewPath);
}

function getHtmlFromPath(
    webview: vscode.Webview,
    extensionPath: string,
    basePath: string,
    webviewPath: string,
): string {
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

    let html = fs.readFileSync(htmlPath, 'utf8');
    const baseDir = path.join(basePath, webviewPath);
    const nonce = getNonce();

    // Replace script tags and inject nonce
    html = html.replace(/<script([^>]*) src="([^"]+)"/g, (match, attrs, src) => {
        if (src.startsWith('http://') || src.startsWith('https://')) {
            return match;
        }
        const assetPath = path.join(baseDir, src);
        const vscodeUri = webview.asWebviewUri(vscode.Uri.file(assetPath)).toString();
        const cleanAttrs = attrs.replace(/\\snonce="[^"]*"/g, '');
        return `<script${cleanAttrs} nonce="${nonce}" src="${vscodeUri}"`;
    });
    
    // Inject nonce for inline scripts if any
    html = html.replace(/<script([^>]*)>/g, (match, attrs) => {
        if (attrs.includes('src=')) {return match;}
        const cleanAttrs = attrs.replace(/\\snonce="[^"]*"/g, '');
        return `<script${cleanAttrs} nonce="${nonce}">`;
    });

    // Replace links to assets with VS Code webview URIs
    html = html.replace(/<link([^>]*) href="([^"]+)"/g, (match, attrs, href) => {
        if (href.startsWith('http://') || href.startsWith('https://')) {
            return match;
        }
        const assetPath = path.join(baseDir, href);
        const vscodeUri = webview.asWebviewUri(vscode.Uri.file(assetPath)).toString();
        return `<link${attrs} href="${vscodeUri}"`;
    });

    // Replace images
    html = html.replace(/<img([^>]*) src="([^"]+)"/g, (match, attrs, src) => {
        if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
            return match;
        }
        const assetPath = path.join(baseDir, src);
        const vscodeUri = webview.asWebviewUri(vscode.Uri.file(assetPath)).toString();
        return `<img${attrs} src="${vscodeUri}"`;
    });

    const csp = `
        <meta
            http-equiv="Content-Security-Policy"
            content="default-src 'none';
                    img-src ${webview.cspSource} https: data:;
                    script-src ${webview.cspSource} 'nonce-${nonce}';
                    style-src ${webview.cspSource} https://fonts.googleapis.com 'unsafe-inline';
                    font-src ${webview.cspSource} https://fonts.gstatic.com;"
        />
    `;

    html = html.replace('</head>', `${csp}</head>`);
    return html;
}
