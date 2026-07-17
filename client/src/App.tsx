import { useEffect, useState } from 'react';
import './App.css';
import MainBody from './components/mainBody/mainBody';

import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { messenger } from './vscode/messenger';
import { useHostEvent } from './vscode/useHostEvent';

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

export default function AppRoot() {
    const [theme, setTheme] = useState<'light' | 'dark'>('dark');

    useHostEvent('refreshTheme', (data) => {
        let themeValue: 'light' | 'dark' = 'dark';
        if (typeof data.theme === 'string') {
            themeValue = data.theme as 'light' | 'dark';
        } else if (typeof data.theme === 'number') {
            themeValue = data.theme === 1 || data.theme === 4 ? 'light' : 'dark';
        }
        setTheme(themeValue);
    });

    useEffect(() => {
        messenger.postMessage({ command: 'refreshTheme' });
    }, []);

    return (
        <ThemeProvider theme={theme === 'dark' ? darkTheme : lightTheme}>
            <CssBaseline />
            <MainBody />
        </ThemeProvider>
    );
}
