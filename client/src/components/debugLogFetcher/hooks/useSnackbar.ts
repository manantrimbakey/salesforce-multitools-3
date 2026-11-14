import { useCallback, useState } from 'react';
import type { SyntheticEvent } from 'react';

export type Severity = 'success' | 'error';

interface SnackbarState {
    open: boolean;
    message: string;
    severity: Severity;
}

export function useSnackbar() {
    const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'success' });

    const notify = useCallback((message: string, severity: Severity = 'success') => {
        setSnackbar({ open: true, message, severity });
    }, []);

    const close = useCallback((_event?: Event | SyntheticEvent, reason?: string) => {
        if (reason === 'clickaway') return;
        setSnackbar((prev) => ({ ...prev, open: false }));
    }, []);

    return { snackbar, notify, close };
}

export type Notify = ReturnType<typeof useSnackbar>['notify'];
