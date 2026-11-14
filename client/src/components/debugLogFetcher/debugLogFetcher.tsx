import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, LinearProgress } from '@mui/material';
import type { SizeDirection } from '../../api/client';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog';
import { LogTable } from './components/LogTable';
import { LogToolbar } from './components/LogToolbar';
import { NotificationSnackbar } from './components/NotificationSnackbar';
import { useDebugLogs } from './hooks/useDebugLogs';
import { useLogActions } from './hooks/useLogActions';
import { useSnackbar } from './hooks/useSnackbar';
import { useTraceFlags } from './hooks/useTraceFlags';
import { useUsers } from './hooks/useUsers';
import { ALL_USERS, userFilterOf } from './utils/user';
import type { UserOption } from './utils/user';

export default function DebugLogFetcher() {
    const { snackbar, notify, close: closeSnackbar } = useSnackbar();

    // --- user selection -----------------------------------------------------------------------
    const [userSearch, setUserSearch] = useState('');
    const { users, knownUsers, currentUser, loading: loadingUsers, error: usersError, reload, patchUser } =
        useUsers(userSearch);
    const [selectedId, setSelectedId] = useState('all');
    const userChosen = useRef(false);

    // Default to the signed-in user once known, unless the user already picked something.
    useEffect(() => {
        if (currentUser && !userChosen.current) {
            userChosen.current = true;
            setSelectedId(currentUser.Id);
        }
    }, [currentUser]);

    // Derived from the id so trace-flag updates to the user list are always reflected.
    const selectedUser = selectedId === 'all' ? undefined : (knownUsers[selectedId] ?? currentUser ?? undefined);
    const selected = useMemo<UserOption>(
        () => (selectedUser?.Id === selectedId ? { kind: 'user', user: selectedUser } : ALL_USERS),
        [selectedUser, selectedId],
    );

    const handleSelectUser = useCallback((option: UserOption) => {
        userChosen.current = true;
        setSelectedId(option.kind === 'all' ? 'all' : option.user.Id);
    }, []);

    // --- logs ---------------------------------------------------------------------------------
    const [logSize, setLogSize] = useState('');
    const [logSizeDirection, setLogSizeDirection] = useState<SizeDirection>('above');
    const debouncedLogSize = useDebouncedValue(logSize);
    const userFilter = userFilterOf(selected);

    const { logs, loading, error: logsError, refresh } = useDebugLogs({
        user: userFilter,
        size: debouncedLogSize,
        sizeDirection: logSizeDirection,
    });

    const { downloading, deleting, download, deleteLogs } = useLogActions({ notify, refreshLogs: refresh });
    const traceFlags = useTraceFlags({ patchUser, reloadUsers: reload, notify });

    // --- delete confirmation ------------------------------------------------------------------
    // undefined = closed, null = delete all logs, string = delete that user's logs
    const [pendingDelete, setPendingDelete] = useState<string | null | undefined>(undefined);
    const confirmDelete = async () => {
        await deleteLogs(pendingDelete ?? null);
        setPendingDelete(undefined);
    };

    // --- error surfacing ----------------------------------------------------------------------
    useEffect(() => {
        if (logsError) notify(`Failed to load logs: ${logsError}`, 'error');
    }, [logsError, notify]);
    useEffect(() => {
        if (usersError) notify(`Failed to load users: ${usersError}`, 'error');
    }, [usersError, notify]);

    const retryAction = (onClick: () => void) => (
        <Button color="inherit" size="small" onClick={onClick}>
            Retry
        </Button>
    );

    return (
        <Card sx={{ borderRadius: '0.25rem', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <LogToolbar
                users={users}
                selected={selected}
                loadingUsers={loadingUsers}
                busy={loading || deleting}
                traceFlagPending={traceFlags.pending}
                logSize={logSize}
                logSizeDirection={logSizeDirection}
                onSelectUser={handleSelectUser}
                onSearchUsers={setUserSearch}
                onRefresh={refresh}
                onDeleteForUser={() => setPendingDelete(userFilter === 'all' ? null : userFilter)}
                onDeleteAll={() => setPendingDelete(null)}
                onStartLogging={traceFlags.start}
                onStopLogging={traceFlags.stop}
                onLogSizeChange={setLogSize}
                onLogSizeDirectionChange={setLogSizeDirection}
            />

            {(loading || deleting) && <LinearProgress sx={{ flexShrink: 0 }} />}

            {logsError && (
                <Alert severity="error" action={retryAction(refresh)} sx={{ flexShrink: 0 }}>
                    Could not load debug logs: {logsError}
                </Alert>
            )}
            {usersError && (
                <Alert severity="warning" action={retryAction(reload)} sx={{ flexShrink: 0 }}>
                    Could not load users: {usersError}
                </Alert>
            )}

            <LogTable logs={logs} loading={loading} downloading={downloading} onDownload={download} />

            <NotificationSnackbar {...snackbar} onClose={closeSnackbar} />
            <DeleteConfirmDialog
                open={pendingDelete !== undefined}
                userName={pendingDelete ?? null}
                deleting={deleting}
                onCancel={() => setPendingDelete(undefined)}
                onConfirm={confirmDelete}
            />
        </Card>
    );
}
