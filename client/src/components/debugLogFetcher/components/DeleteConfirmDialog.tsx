import { Dialog, DialogTitle, DialogContent, DialogActions, Button, CircularProgress } from '@mui/material';

interface Props {
    pendingDelete: { userName: string | null } | null;
    deleting: boolean;
    onClose: () => void;
    onConfirm: (userName: string | null) => void;
}

export const DeleteConfirmDialog: React.FC<Props> = ({ pendingDelete, deleting, onClose, onConfirm }) => {
    return (
        <Dialog open={!!pendingDelete} onClose={onClose} aria-labelledby="delete-confirmation-dialog-title">
            <DialogTitle id="delete-confirmation-dialog-title">Confirm Deletion</DialogTitle>
            <DialogContent>
                {pendingDelete?.userName
                    ? `Are you sure you want to delete logs for "${pendingDelete.userName}"?`
                    : 'Are you sure you want to delete all logs?'}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="primary" variant="outlined" disabled={deleting}>
                    Cancel
                </Button>
                <Button
                    onClick={() => {
                        onConfirm(pendingDelete?.userName ?? null);
                    }}
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
};
