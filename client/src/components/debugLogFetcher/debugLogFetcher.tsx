import { useState, useEffect, useRef } from 'react';
import { Card, LinearProgress } from '@mui/material';
import type { User } from './types';
import { useDebugLogs, useUsers, useTraceFlags } from './hooks';
import { DebugLogToolbar } from './components/DebugLogToolbar';
import { LogsTable } from './components/LogsTable';
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog';
import { SnackbarHost } from './components/SnackbarHost';

export default function DebugLogFetcher() {
    const { logs, loading: loadingLogs, fetchLogs, downloadingLogId, downloadFullLog, deleteLogs } = useDebugLogs();
    const { users, loadingUsers, fetchUsers, currentUser } = useUsers();
    const { traceFlagOperations, startLogging, stopLogging } = useTraceFlags();

    const [selectedUser, setSelectedUser] = useState<User | { Id: string; Name: string } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
        open: false, message: '', severity: 'success',
    });
    const [pendingDelete, setPendingDelete] = useState<{ userName: string | null } | null>(null);
    const [logSize, setLogSize] = useState<string>('');
    const [logSizeDirection, setLogSizeDirection] = useState<'above' | 'below'>('above');
    const didAutoSelectUser = useRef(false);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    useEffect(() => {
        if (currentUser && !selectedUser && !didAutoSelectUser.current) {
            didAutoSelectUser.current = true;
            const actualCurrentUser = users.find((user) => user.Username === currentUser.username);
            if (actualCurrentUser) {
                setSelectedUser(actualCurrentUser);
            } else {
                setSelectedUser({
                    Id: 'current',
                    Name: currentUser.display_name,
                    Username: currentUser.username,
                    TraceFlagActive: false,
                    TraceFlagId: undefined,
                } as User);
            }
        }
    }, [currentUser, users, selectedUser]);

    useEffect(() => {
        if (selectedUser) {
            fetchLogs(selectedUser.Name, logSize, logSizeDirection);
        }
    }, [currentUser, fetchLogs, selectedUser, logSize, logSizeDirection]);

    const handleUserChange = (_event: React.SyntheticEvent, newValue: User | { Id: string; Name: string } | null) => {
        setSelectedUser(newValue);
        if (newValue === null || newValue.Id === 'all') {
            fetchLogs('all', logSize, logSizeDirection);
        } else {
            fetchLogs(newValue.Name, logSize, logSizeDirection);
        }
    };

    const handleRefresh = () => {
        if (selectedUser === null) {
            fetchLogs('all', logSize, logSizeDirection);
        } else {
            fetchLogs(selectedUser.Name, logSize, logSizeDirection);
        }
    };

    const handleDeleteLogs = async (userName: string | null) => {
        setDeleting(true);
        try {
            const response = await deleteLogs(userName);
            if (response && response.success !== false) {
                setSnackbar({
                    open: true,
                    message: `Deleted ${response.deleted ?? 0} logs${response.failed && response.failed > 0 ? ', failed: ' + response.failed : ''}`,
                    severity: 'success',
                });
                fetchLogs(userName && userName !== 'all' ? userName : 'all');
            } else {
                setSnackbar({
                    open: true,
                    message: 'Failed to delete logs: ' + (response?.error || 'Unknown error'),
                    severity: 'error',
                });
            }
        } catch (e) {
            setSnackbar({ open: true, message: 'Error deleting logs: ' + (e instanceof Error ? e.message : String(e)), severity: 'error' });
        } finally {
            setDeleting(false);
        }
    };

    const handleStartLogging = async (userId: string) => {
        try {
            const response = await startLogging(userId);
            if (response) {
                setSnackbar({ open: true, message: `Started logging for user. Trace flag created successfully.`, severity: 'success' });
                if (selectedUser && selectedUser.Id === userId) {
                    const expirationDate = new Date();
                    expirationDate.setHours(expirationDate.getHours() + 1);
                    setSelectedUser({
                        ...selectedUser,
                        TraceFlagId: response.traceFlagId,
                        TraceFlagActive: true,
                        TraceFlagExpirationDate: expirationDate.toISOString(),
                    } as User);
                }
                fetchUsers();
            }
        } catch (error) {
            setSnackbar({ open: true, message: 'Error starting logging: ' + (error instanceof Error ? error.message : String(error)), severity: 'error' });
        }
    };

    const handleStopLogging = async (userId: string, traceFlagId: string) => {
        try {
            await stopLogging(userId, traceFlagId);
            setSnackbar({ open: true, message: `Stopped logging for user. Trace flag removed successfully.`, severity: 'success' });
            if (selectedUser && selectedUser.Id === userId) {
                setSelectedUser({
                    ...selectedUser,
                    TraceFlagId: undefined,
                    TraceFlagActive: false,
                    TraceFlagExpirationDate: undefined,
                } as User);
            }
            fetchUsers();
        } catch (error) {
            setSnackbar({ open: true, message: 'Error stopping logging: ' + (error instanceof Error ? error.message : String(error)), severity: 'error' });
        }
    };

    return (
        <Card sx={{ borderRadius: '0.25rem', height: 'calc(100% - 1rem)', maxHeight: 'calc(100% - 1rem)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <DebugLogToolbar
                users={users}
                loadingUsers={loadingUsers}
                loading={loadingLogs}
                deleting={deleting}
                selectedUser={selectedUser}
                traceFlagOperations={traceFlagOperations}
                logSize={logSize}
                logSizeDirection={logSizeDirection}
                onUserChange={handleUserChange}
                onInputChange={(v) => fetchUsers(v)}
                onStartLogging={handleStartLogging}
                onStopLogging={handleStopLogging}
                onRefresh={handleRefresh}
                onDeleteSelected={() => setPendingDelete({ userName: selectedUser ? selectedUser.Name : null })}
                onDeleteAll={() => setPendingDelete({ userName: null })}
                onLogSizeChange={setLogSize}
                onLogSizeDirectionChange={setLogSizeDirection}
            />

            {(loadingLogs || deleting) && <LinearProgress sx={{ flexShrink: 0 }} />}

            <LogsTable logs={logs} loading={loadingLogs} downloadingLogId={downloadingLogId} onDownloadFullLog={downloadFullLog} />

            <SnackbarHost open={snackbar.open} message={snackbar.message} severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} />
            
            <DeleteConfirmDialog pendingDelete={pendingDelete} deleting={deleting} onClose={() => setPendingDelete(null)} onConfirm={(userName) => { handleDeleteLogs(userName); setPendingDelete(null); }} />
        </Card>
    );
}
