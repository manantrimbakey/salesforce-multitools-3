import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';

interface Props {
    open: boolean;
    /** User whose logs will be deleted; null means all logs. */
    userName: string | null;
    deleting: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

export function DeleteConfirmDialog({ open, userName, deleting, onCancel, onConfirm }: Props) {
    return (
        <Dialog open={open} onClose={onCancel} aria-labelledby="delete-confirmation-dialog-title">
            <DialogTitle id="delete-confirmation-dialog-title">Confirm Deletion</DialogTitle>
            <DialogContent>
                {userName
                    ? `Are you sure you want to delete logs for "${userName}"?`
                    : 'Are you sure you want to delete all logs?'}
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel} color="primary" variant="outlined" disabled={deleting}>
                    Cancel
                </Button>
                <Button
                    onClick={onConfirm}
                    color="error"
                    variant="contained"
                    autoFocus
                    disabled={deleting}
                    startIcon={deleting ? <CircularProgress size={18} color="inherit" /> : null}
                >
                    {deleting ? 'Deleting...' : 'Confirm'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
