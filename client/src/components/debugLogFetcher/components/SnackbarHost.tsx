import { Snackbar, Alert } from '@mui/material';

interface Props {
    open: boolean;
    message: string;
    severity: 'success' | 'error';
    onClose: () => void;
}

export const SnackbarHost: React.FC<Props> = ({ open, message, severity, onClose }) => {
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
};
