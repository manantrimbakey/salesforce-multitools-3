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
    typography: {
        fontSize: 12,
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
                // Handle both string values and numeric enum values from VSCode
                let themeValue: 'light' | 'dark' = 'dark';

                if (typeof message.data.theme === 'string') {
                    // If theme is provided as a string ('dark' or 'light')
                    themeValue = message.data.theme as 'light' | 'dark';
                } else if (typeof message.data.theme === 'number') {
                    // If theme is provided as a ColorThemeKind enum value
                    // VSCode enum: 1 = Light, 2 = Dark, 3 = High Contrast, 4 = High Contrast Light
                    themeValue = message.data.theme === 1 || message.data.theme === 4 ? 'light' : 'dark';
                }

                console.log('Theme update received:', message.data.theme, '→', themeValue);
                setTheme(themeValue);
            }
        };

        window.addEventListener('message', handleMessage);

        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    return (
        <ThemeProvider theme={theme === 'dark' ? darkTheme : lightTheme}>
            <CssBaseline />
            <MainBody />
        </ThemeProvider>
    );
}

function AppWithVSCodeApi() {
    const vscodeApi = useVSCodeApi();

    // Request theme on mount
    useEffect(() => {
        vscodeApi.postMessage({ command: 'refreshTheme' });
    }, [vscodeApi]);

    return <App />;
}

export default function AppRoot() {
    return (
        <VSCodeApiProvider>
            <AppWithVSCodeApi />
        </VSCodeApiProvider>
    );
}
