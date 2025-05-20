import * as vscode from 'vscode';
import { ExpressServer } from './expressServer';
import { Logger } from './logger';

/**
 * Create a webview panel with the Express server CSP configured
 *
 * @param viewType Unique identifier for this webview type
 * @param title Title of the webview panel
 * @param column The column to show the webview panel in
 * @param options Webview options
 * @returns The created WebviewPanel
 */
export function createWebviewPanel(
    viewType: string,
    title: string,
    column: vscode.ViewColumn,
    options: vscode.WebviewPanelOptions & vscode.WebviewOptions,
): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(viewType, title, column, {
        enableScripts: true,
        retainContextWhenHidden: true,
        ...options,
    });

    panel.webview.options = {
        ...panel.webview.options,
        enableScripts: true,
    };

    // Configure CSP to allow access to Express server
    configureWebviewForServer(panel.webview);

    return panel;
}

/**
 * Configure a webview to access the Express server
 *
 * @param webview The webview to configure
 */
export function configureWebviewForServer(webview: vscode.Webview): void {
    // Set CSP to allow connecting to Express server
    const csp = getWebviewCsp(webview);
    webview.html = getHtmlWithCsp(webview.html || '', csp);
}

/**
 * Get the appropriate CSP headers for connecting to the Express server
 *
 * @param webview The webview to configure
 */
export function getWebviewCsp(webview: vscode.Webview): string {
    // Basic CSP
    const csp = [
        `default-src 'none'`,
        `style-src 'unsafe-inline' ${webview.cspSource} https://fonts.googleapis.com`,
        `script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval'`,
        `img-src ${webview.cspSource} data: https: blob:`,
        `font-src ${webview.cspSource} https://fonts.gstatic.com`,
        `connect-src ${webview.cspSource} https:`,
        `frame-src ${webview.cspSource}`,
        `media-src ${webview.cspSource}`,
        `worker-src ${webview.cspSource} blob:`,
    ];

    // Add the Express server origin to connect-src if server is running
    const server = ExpressServer.getInstance();
    if (server.isRunning()) {
        const url = new URL(server.getBaseUrl());
        csp[5] = `connect-src ${webview.cspSource} ${url.origin} https: wss: data:`;
        Logger.debug(`Express server origin added to CSP`);
    }

    return csp.join('; ');
}

/**
 * Add CSP meta tag to HTML content
 *
 * @param html Original HTML content
 * @param csp CSP content
 * @returns HTML with CSP meta tag
 */
function getHtmlWithCsp(html: string, csp: string): string {
    // If there's no HTML yet, create a basic template
    if (!html || html.trim() === '') {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>Salesforce Multitools</title>
</head>
<body>
    <div id="root">Loading...</div>
    ${getServerConnectionScript()}
</body>
</html>`;
    }

    // If HTML already exists, add or update the CSP meta tag
    if (html.includes('<meta http-equiv="Content-Security-Policy"')) {
        // Replace existing CSP
        return html.replace(
            /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i,
            `<meta http-equiv="Content-Security-Policy" content="${csp}"`,
        );
    } else {
        // Add CSP after other meta tags
        return html.replace(
            /<head>([\s\S]*?)(<\/head>)/i,
            `<head>$1<meta http-equiv="Content-Security-Policy" content="${csp}">\n$2`,
        );
    }
}

/**
 * Generate script to connect to the Express server
 *
 * @returns Script element as string
 */
function getServerConnectionScript(): string {
    const server = ExpressServer.getInstance();
    if (!server.isRunning()) {
        return '';
    }

    const serverUrl = server.getBaseUrl();
    const extensionToken = server instanceof ExpressServer ? 'vscode-salesforce-multitools-' + process.pid : '';

    return `<script>
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
</script>`;
}

/**
 * Get HTML for a webview with server connection script
 *
 * @param webview The webview to generate HTML for
 * @param mainContent The main content for the webview
 * @returns Complete HTML for the webview
 */
export function getWebviewHtml(webview: vscode.Webview, mainContent: string): string {
    const csp = getWebviewCsp(webview);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>Salesforce Multitools</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 0;
            margin: 0;
        }
    </style>
</head>
<body>
    <div id="root">${mainContent}</div>
    ${getServerConnectionScript()}
</body>
</html>`;
}
