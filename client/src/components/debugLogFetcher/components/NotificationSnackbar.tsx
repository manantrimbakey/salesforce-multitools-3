import { Alert, Snackbar } from '@mui/material';
import type { SyntheticEvent } from 'react';
import type { Severity } from '../hooks/useSnackbar';

interface Props {
    open: boolean;
    message: string;
    severity: Severity;
    onClose: (event?: Event | SyntheticEvent, reason?: string) => void;
}

export function NotificationSnackbar({ open, message, severity, onClose }: Props) {
    return (
        <Snackbar
            open={open}
            autoHideDuration={4000}
            onClose={onClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
            <Alert onClose={onClose} severity={severity} sx={{ width: '100%' }}>
                {message}
            </Alert>
        </Snackbar>
    );
}
