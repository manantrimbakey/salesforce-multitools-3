import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export interface WebviewRequest {
    type: 'request';
    id: string;
    channel: string;
    payload?: any;
}

export interface WebviewResponse {
    type: 'response';
    id: string;
    ok: boolean;
    data?: any;
    error?: string;
}

export interface WebviewEvent {
    command: string;
    data?: any;
    component?: string;
}

export type ChannelHandler = (payload: any) => Promise<any> | any;

export class WebviewMessenger {
    private handlers = new Map<string, ChannelHandler>();
    private disposables: vscode.Disposable[] = [];

    constructor(private webview: vscode.Webview) {
        this.disposables.push(
            this.webview.onDidReceiveMessage(async (message) => {
                if (message && message.type === 'request') {
                    await this.handleRequest(message as WebviewRequest);
                }
            })
        );
    }

    public registerHandler(channel: string, handler: ChannelHandler) {
        this.handlers.set(channel, handler);
    }

    private async handleRequest(req: WebviewRequest) {
        const handler = this.handlers.get(req.channel);
        if (!handler) {
            this.sendResponse({ type: 'response', id: req.id, ok: false, error: `No handler for channel: ${req.channel}` });
            return;
        }

        try {
            const data = await handler(req.payload);
            this.sendResponse({ type: 'response', id: req.id, ok: true, data });
        } catch (error: any) {
            Logger.error(`Error in channel ${req.channel}:`, 'WebviewMessenger', error);
            this.sendResponse({ type: 'response', id: req.id, ok: false, error: error.message || String(error) });
        }
    }

    private sendResponse(res: WebviewResponse) {
        this.webview.postMessage(res).then(undefined, (error) => {
             Logger.error('Failed to send response to webview', 'WebviewMessenger', error);
        });
    }

    public post(command: string, data?: any, component?: string) {
        // If component is provided but we can just map it into the event:
        const event: WebviewEvent = component ? { command, data, component } : { command, data };
        this.webview.postMessage(event).then(undefined, (error) => {
            Logger.error(`Failed to post event ${command}`, 'WebviewMessenger', error);
        });
    }

    public dispose() {
        this.handlers.clear();
        this.disposables.forEach(d => d.dispose());
    }
}
