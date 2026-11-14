import { useEffect, useState } from 'react';
import type { Theme } from '@mui/material/styles';
import { useHostMessage } from '../hooks/useHostMessage';
import { createVsCodeTheme, detectModeFromBody, modeFromHostTheme, readVsCodeTokens } from './vscodeTheme';
import type { ThemeMode } from './vscodeTheme';

interface Built {
    signature: string;
    theme: Theme;
}

function build(hostMode: ThemeMode): Built {
    // The body class is authoritative; the host's message is only a fallback outside VS Code.
    const mode = detectModeFromBody() ?? hostMode;
    const tokens = readVsCodeTokens(mode);
    return { signature: JSON.stringify([mode, tokens]), theme: createVsCodeTheme(mode, tokens) };
}

/** MUI theme derived from the live --vscode-* CSS variables; updates whenever VS Code switches themes. */
export function useVsCodeTheme(): Theme {
    const [hostMode, setHostMode] = useState<ThemeMode>('dark');
    const [built, setBuilt] = useState<Built>(() => build('dark'));

    useHostMessage('refreshTheme', (message) => setHostMode(modeFromHostTheme(message.data.theme)));

    useEffect(() => {
        const refresh = () => setBuilt((prev) => {
            const next = build(hostMode);
            return next.signature === prev.signature ? prev : next;
        });
        refresh();

        let frame = 0;
        const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(refresh);
        };
        // VS Code swaps the class on <body> and rewrites the variables on <html style="...">.
        const observer = new MutationObserver(schedule);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [hostMode]);

    return built.theme;
}
