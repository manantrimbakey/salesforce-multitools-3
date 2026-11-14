// Ambient declarations for everything the extension host injects into the webview window.

/** Minimal shape of the object returned by VS Code's `acquireVsCodeApi()`. */
interface RawVsCodeApi {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

interface Window {
    /** Provided by VS Code inside webviews. Absent when running in a plain browser (vite dev). */
    acquireVsCodeApi?: () => RawVsCodeApi;
    /** Injected by the extension host: performs an API call and resolves with the parsed JSON body. */
    callServerApi?: (endpoint: string, method?: string, data?: unknown) => Promise<unknown>;
}
