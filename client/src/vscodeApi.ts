import type { ClientMessage } from './messages';

export interface VsCodeApi {
    postMessage(message: ClientMessage): void;
    getState(): unknown;
    setState(state: unknown): void;
}

// `acquireVsCodeApi()` may only be called once per webview, so the instance is acquired here and shared.
function acquire(): VsCodeApi {
    if (typeof window.acquireVsCodeApi === 'function') {
        try {
            return window.acquireVsCodeApi();
        } catch (error) {
            console.error('Error acquiring VS Code API:', error);
        }
    }
    console.warn('Running outside of a VS Code webview, using mock API');
    return {
        postMessage: (message) => console.log('VS Code message:', message),
        getState: () => ({}),
        setState: (state) => console.log('VS Code state:', state),
    };
}

export const vscode: VsCodeApi = acquire();
