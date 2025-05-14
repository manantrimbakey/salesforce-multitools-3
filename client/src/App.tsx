import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import './App.css';
import MainBody from './components/mainBody/mainBody';

// VS Code API - will be acquired when running inside the webview
declare global {
    interface Window {
        acquireVsCodeApi: () => {
            postMessage: (message: unknown) => void;
            getState: () => unknown;
            setState: (state: unknown) => void;
        };
    }
}

// Define the VS Code API type
interface VSCodeApi {
    postMessage: (message: unknown) => void;
    getState: () => unknown;
    setState: (state: unknown) => void;
}

// Create context for VS Code API
const VSCodeApiContext = createContext<VSCodeApi | null>(null);

// Custom hook to use VS Code API
export const useVSCodeApi = () => {
    const context = useContext(VSCodeApiContext);
    if (!context) {
        throw new Error('useVSCodeApi must be used within a VSCodeApiProvider');
    }
    return context;
};

// Provider component for VS Code API
export const VSCodeApiProvider = ({ children }: { children: ReactNode }) => {
    // Get the VS Code API instance
    const vscode = (() => {
        try {
            return window.acquireVsCodeApi();
        } catch (error) {
            console.error('Error acquiring VS Code API:', error);
            // When running outside of VS Code webview, provide a mock implementation
            console.warn('Running outside of VS Code webview, using mock API');
            return {
                postMessage: (message: unknown) => console.log('VS Code message:', message),
                getState: () => ({}),
                setState: (state: unknown) => console.log('VS Code state:', state),
            };
        }
    })();

    return <VSCodeApiContext.Provider value={vscode}>{children}</VSCodeApiContext.Provider>;
};

function App() {
    return (
        <VSCodeApiProvider>
            <MainBody />
        </VSCodeApiProvider>
    );
}

export default App;
