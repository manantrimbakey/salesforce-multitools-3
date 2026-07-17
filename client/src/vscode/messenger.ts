import type { WebviewRequest, WebviewResponse, WebviewEvent } from './messages';

class VSCodeMessenger {
    private idCounter = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private pendingRequests = new Map<string, { resolve: (data: any) => void; reject: (error: any) => void }>();
    private eventListeners = new Set<(event: WebviewEvent) => void>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private vscode: any;

    constructor() {
        try {
            // @ts-expect-error acquireVsCodeApi is not defined globally in this context
            this.vscode = acquireVsCodeApi();
        } catch {
            this.vscode = {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                postMessage: (msg: any) => console.log('postMessage', msg),
            };
        }

        window.addEventListener('message', (event) => {
            const message = event.data;
            if (message && message.type === 'response') {
                const res = message as WebviewResponse;
                const pending = this.pendingRequests.get(res.id);
                if (pending) {
                    this.pendingRequests.delete(res.id);
                    if (res.ok) {
                        pending.resolve(res.data);
                    } else {
                        pending.reject(new Error(res.error || 'Unknown error'));
                    }
                }
            } else if (message && message.command) {
                this.eventListeners.forEach(listener => listener(message as WebviewEvent));
            }
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public async callHost<T = any>(channel: string, payload?: any): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const id = `req_${++this.idCounter}_${Date.now()}`;
            this.pendingRequests.set(id, { resolve, reject });
            const req: WebviewRequest = { type: 'request', id, channel, payload };
            this.vscode.postMessage(req);
        });
    }

    public onEvent(listener: (event: WebviewEvent) => void): () => void {
        this.eventListeners.add(listener);
        return () => this.eventListeners.delete(listener);
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public postMessage(msg: any) {
        this.vscode.postMessage(msg);
    }
}

export const messenger = new VSCodeMessenger();
export const callHost = messenger.callHost.bind(messenger);
