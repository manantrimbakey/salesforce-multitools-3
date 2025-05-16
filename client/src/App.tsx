import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import './App.css';
import MainBody from './components/mainBody/mainBody';

import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

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
// eslint-disable-next-line react-refresh/only-export-components
export const useVSCodeApi = () => {
    const context = useContext(VSCodeApiContext);
    if (!context) {
        throw new Error('useVSCodeApi must be used within a VSCodeApiProvider');
    }
    return context;
};

// Get the VS Code API instance
const getVSCodeApi = (): VSCodeApi => {
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
};

// Provider component for VS Code API
export const VSCodeApiProvider = ({ children }: { children: ReactNode }) => {
    // Initialize the API only once
    const [vscodeApi] = useState(getVSCodeApi);

    return <VSCodeApiContext.Provider value={vscodeApi}>{children}</VSCodeApiContext.Provider>;
};

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
    },
});

const lightTheme = createTheme({
    palette: {
        mode: 'light',
    },
});

function App() {
    const [theme, setTheme] = useState<'light' | 'dark'>('dark');

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.command === 'refreshTheme') {
                setTheme(message.data.theme);
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    return (
        <VSCodeApiProvider>
            <ThemeProvider theme={theme === 'dark' ? darkTheme : lightTheme}>
                <CssBaseline />
                <MainBody />
            </ThemeProvider>
        </VSCodeApiProvider>
    );
}

export default App;
