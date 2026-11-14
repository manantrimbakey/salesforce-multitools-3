import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { randomBytes } from 'crypto';

/** `refreshTheme` message understood by client/src/App.tsx. */
export interface ThemeMessage {
    command: 'refreshTheme';
    data: { theme: 'dark' | 'light' };
}

/**
 * Bridge injected into every webview. It
 *  - acquires the VS Code API once (it may only be acquired a single time per webview) and makes
 *    later `acquireVsCodeApi()` calls from the bundled app return that same object, and
 *  - defines `window.callServerApi(endpoint, method, data)` on top of postMessage; the host side
 *    lives in src/rpc/attachRpc.ts.
 */
const BRIDGE_SCRIPT = `
(function () {
    if (typeof acquireVsCodeApi !== 'function') {
        return;
    }
    var api = acquireVsCodeApi();
    window.vscodeApi = api;
    window.acquireVsCodeApi = function () {
        return api;
    };

    var pending = new Map();
    var nextId = 1;

    window.addEventListener('message', function (event) {
        var message = event.data;
        if (!message || message.type !== 'apiResponse') {
            return;
        }
        var request = pending.get(message.id);
        if (!request) {
            return;
        }
        pending.delete(message.id);
        if (message.ok) {
            request.resolve(message.result);
        } else {
            var error = new Error(message.error || 'Request failed');
            error.code = message.code;
            request.reject(error);
        }
    });

    window.callServerApi = function (endpoint, method, data) {
        return new Promise(function (resolve, reject) {
            var id = nextId++;
            pending.set(id, { resolve: resolve, reject: reject });
            api.postMessage({
                type: 'api',
                id: id,
                endpoint: endpoint,
                method: method || 'GET',
                data: data === undefined ? null : data
            });
        });
    };
})();
`;

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function errorPage(message: string): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error</title>
</head>
<body>
    <h1>Error</h1>
    <p>${escapeHtml(message)}</p>
</body>
</html>`;
}

/**
 * Helper class for working with webviews in VS Code extensions
 */
export class WebviewUtils {
    /**
     * Theme message for the current VS Code color theme. High contrast themes map to their
     * dark / light base so every host sends the same representation.
     */
    public static getThemeMessage(): ThemeMessage {
        const kind = vscode.window.activeColorTheme.kind;
        const isLight = kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight;
        return { command: 'refreshTheme', data: { theme: isLight ? 'light' : 'dark' } };
    }

    /**
     * Get the HTML content for a webview, including the bundled React app
     * @param webview The webview to get HTML for
     * @param extensionPath The path to the extension
     * @param webviewPath Path to the webview relative to the extension's dist/webview folder
     * @returns HTML content for the webview
     */
    public static async getWebviewContent(
        webview: vscode.Webview,
        extensionPath: string,
        webviewPath: string = '',
    ): Promise<string> {
        const baseDir = path.join(extensionPath, 'dist', 'webview', webviewPath);
        const htmlPath = path.join(baseDir, 'index.html');

        let html: string;
        try {
            html = await fs.promises.readFile(htmlPath, 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return errorPage(`Webview resources not found at ${htmlPath}. Run the client build first.`);
            }
            throw error;
        }

        const nonce = randomBytes(16).toString('base64');
        html = this.replaceAssetPaths(html, webview, baseDir);
        return this.injectHeadContent(html, this.getCSPMetaTag(webview, nonce) + this.getBridgeScriptTag(nonce));
    }

    /**
     * Replace relative asset paths in HTML with VS Code webview URIs
     */
    private static replaceAssetPaths(html: string, webview: vscode.Webview, baseDir: string): string {
        const toWebviewUri = (asset: string): string =>
            webview.asWebviewUri(vscode.Uri.file(path.join(baseDir, asset))).toString();
        const isAbsoluteUrl = (value: string): boolean => /^(https?:|data:)/.test(value);

        return html
            .replace(/<script([^>]*) src="([^"]+)"/g, (match, attrs: string, src: string) =>
                isAbsoluteUrl(src) ? match : `<script${attrs} src="${toWebviewUri(src)}"`,
            )
            .replace(/<link([^>]*) href="([^"]+)"/g, (match, attrs: string, href: string) =>
                isAbsoluteUrl(href) ? match : `<link${attrs} href="${toWebviewUri(href)}"`,
            )
            .replace(/<img([^>]*) src="([^"]+)"/g, (match, attrs: string, src: string) =>
                isAbsoluteUrl(src) ? match : `<img${attrs} src="${toWebviewUri(src)}"`,
            );
    }

    /**
     * Insert markup at the very start of <head> so the CSP and the bridge exist before any
     * application script runs.
     */
    private static injectHeadContent(html: string, content: string): string {
        const headOpen = /<head[^>]*>/i;
        if (headOpen.test(html)) {
            return html.replace(headOpen, (match) => `${match}${content}`);
        }
        return `${content}${html}`;
    }

    /**
     * Content Security Policy. The webview talks to the extension host exclusively through
     * postMessage, so no network origin is allowed.
     */
    private static getCSPMetaTag(webview: vscode.Webview, nonce: string): string {
        return `
            <meta
                http-equiv="Content-Security-Policy"
                content="default-src 'none';
                        img-src ${webview.cspSource} data:;
                        script-src ${webview.cspSource} 'nonce-${nonce}';
                        style-src ${webview.cspSource} 'unsafe-inline';
                        font-src ${webview.cspSource};
                        connect-src 'none';"
            />
        `;
    }

    private static getBridgeScriptTag(nonce: string): string {
        return `<script nonce="${nonce}">${BRIDGE_SCRIPT}</script>`;
    }
}
