import { useEffect } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import MainBody from './components/mainBody/mainBody';
import { useVsCodeTheme } from './theme/useVsCodeTheme';
import { vscode } from './vscodeApi';

export default function App() {
    const theme = useVsCodeTheme();

    // The theme is derived from the DOM, but ask the host once as a fallback for non-VS Code hosts.
    useEffect(() => {
        vscode.postMessage({ command: 'refreshTheme' });
    }, []);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <MainBody />
        </ThemeProvider>
    );
}
