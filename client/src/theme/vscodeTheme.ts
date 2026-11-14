import { createTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';

export type ThemeMode = 'light' | 'dark';

/** Concrete (resolved) values of the VS Code theme tokens we map onto the MUI palette. */
export interface VsCodeTokens {
    background: string;
    foreground: string;
    description: string;
    border: string;
    primary: string;
    primaryText: string;
    error: string;
    success: string;
    warning: string;
    hover: string;
    fontFamily: string;
    fontSize: number;
}

const COLOR_PATTERN = /^(#|rgb|hsl)/i;

function readVar(name: string): string {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function readColor(name: string, fallback: string): string {
    const value = readVar(name);
    return COLOR_PATTERN.test(value) ? value : fallback;
}

/** Derive light/dark from the classes VS Code puts on <body>; undefined when not inside VS Code. */
export function detectModeFromBody(): ThemeMode | undefined {
    const { classList } = document.body;
    if (classList.contains('vscode-light') || classList.contains('vscode-high-contrast-light')) return 'light';
    if (classList.contains('vscode-dark') || classList.contains('vscode-high-contrast')) return 'dark';
    return undefined;
}

/** Map vscode.ColorThemeKind (or 'light'/'dark') sent by the host onto a mode. */
export function modeFromHostTheme(theme: string | number): ThemeMode {
    if (typeof theme === 'number') return theme === 1 || theme === 4 ? 'light' : 'dark';
    return theme === 'light' ? 'light' : 'dark';
}

export function readVsCodeTokens(mode: ThemeMode): VsCodeTokens {
    const dark = mode === 'dark';
    const fontSize = parseFloat(readVar('--vscode-font-size'));
    return {
        background: readColor('--vscode-editor-background', dark ? '#1e1e1e' : '#ffffff'),
        foreground: readColor('--vscode-editor-foreground', dark ? '#cccccc' : '#333333'),
        description: readColor('--vscode-descriptionForeground', dark ? '#9d9d9d' : '#717171'),
        border: readColor('--vscode-panel-border', dark ? '#808080' : '#c8c8c8'),
        primary: readColor('--vscode-button-background', dark ? '#0e639c' : '#007acc'),
        primaryText: readColor('--vscode-button-foreground', '#ffffff'),
        error: readColor('--vscode-errorForeground', dark ? '#f48771' : '#a1260d'),
        success: readColor('--vscode-charts-green', dark ? '#89d185' : '#388a34'),
        warning: readColor('--vscode-editorWarning-foreground', dark ? '#cca700' : '#bf8803'),
        hover: readColor('--vscode-list-hoverBackground', dark ? '#2a2d2e' : '#f0f0f0'),
        fontFamily: readVar('--vscode-font-family') || 'system-ui, sans-serif',
        fontSize: Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 13,
    };
}

export function createVsCodeTheme(mode: ThemeMode, t: VsCodeTokens): Theme {
    return createTheme({
        palette: {
            mode,
            primary: { main: t.primary, contrastText: t.primaryText },
            error: { main: t.error },
            success: { main: t.success },
            warning: { main: t.warning },
            background: { default: t.background, paper: t.background },
            text: { primary: t.foreground, secondary: t.description, disabled: t.description },
            divider: t.border,
            action: { hover: t.hover },
        },
        typography: { fontFamily: t.fontFamily, fontSize: t.fontSize },
        components: {
            MuiCssBaseline: {
                styleOverrides: {
                    'html, body, #root': { height: '100%', width: '100%', margin: 0, padding: 0 },
                    body: { overflow: 'hidden' },
                },
            },
            // Material's dark-mode elevation overlay would tint panels away from the editor background.
            MuiPaper: { styleOverrides: { root: { backgroundImage: 'none', maxWidth: '100%' } } },
            MuiTableCell: {
                styleOverrides: {
                    root: { borderColor: t.border },
                    stickyHeader: { backgroundColor: t.background, boxShadow: `0 1px 0 ${t.border}` },
                },
            },
            MuiTooltip: { styleOverrides: { tooltip: { maxWidth: 400, overflowWrap: 'anywhere' } } },
        },
    });
}
