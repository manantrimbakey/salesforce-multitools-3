import { useState, useEffect, useRef } from 'react';
import {
    Card,
    TableContainer,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    IconButton,
    Tooltip,
    Box,
    LinearProgress,
    Typography,
    Chip,
    CircularProgress,
    TextField,
    Autocomplete,
    Snackbar,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Grid,
    Divider,
    InputAdornment,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import FilterListIcon from '@mui/icons-material/FilterList';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';

// Extend window interface to include server properties
declare global {
    interface Window {
        serverBaseUrl: string;
        callServerApi: <T>(endpoint: string, method?: string, data?: unknown) => Promise<T>;
    }
}

declare type Log = {
    Id: string;
    LogUser: {
        Name: string;
    };
    LogLength: number;
    StartTime: string;
    Operation: string;
    Application: string;
    Status: string;
    RequestIdentifier: string;
    methodName?: string;
};

declare type Response = {
    success: boolean;
    logs: {
        records: Log[];
        totalSize: number;
        done: boolean;
    };
};

declare type MethodNameResponse = {
    success: boolean;
    methodName: string;
    logId: string;
};

declare type User = {
    Id: string;
    Name: string;
    Username?: string;
};

declare type UsersResponse = {
    success: boolean;
    users: User[];
    currentUser: {
        display_name: string;
        username: string;
    };
};

// Create a cache for method names
interface MethodNameCache {
    [logId: string]: {
        methodName: string;
        timestamp: number;
    };
}

// Global cache that persists between renders
const methodNameCache: MethodNameCache = {};

// Rate limiter for API requests
const activeRequests = new Set<string>();
const MAX_CONCURRENT_REQUESTS = 3;
const requestQueue: string[] = [];

// Process the next item in the queue
function processNextInQueue() {
    if (requestQueue.length === 0 || activeRequests.size >= MAX_CONCURRENT_REQUESTS) {
        return;
    }

    const logId = requestQueue.shift();
    if (logId && !activeRequests.has(logId)) {
        // Dispatch a custom event to trigger the fetch for this specific logId
        window.dispatchEvent(new CustomEvent('process-method-name', { detail: { logId } }));
    }
}

// Method Name Component
function MethodName({ logId }: { logId: string }) {
    const [methodName, setMethodName] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [shouldFetch, setShouldFetch] = useState(false);
    const [isQueued, setIsQueued] = useState(false);
    const ref = useRef<HTMLSpanElement | null>(null);
    // Add timeout ref to track and cancel long-running requests
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Listen for the custom event to process this specific logId
    useEffect(() => {
        const handleProcessEvent = (event: Event) => {
            // Check if this event is for this component
            const customEvent = event as CustomEvent;
            if (customEvent.detail?.logId === logId) {
                setIsQueued(false);
                setShouldFetch(true);
            }
        };

        window.addEventListener('process-method-name', handleProcessEvent);

        return () => {
            window.removeEventListener('process-method-name', handleProcessEvent);
        };
    }, [logId]);

    useEffect(() => {
        // Use Intersection Observer to trigger fetch only when visible
        const node = ref.current;
        if (!node) return;
        const observer = new window.IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        // Check if we already have a cached value
                        const cachedData = methodNameCache[logId];
                        const cacheExpiration = 30 * 60 * 1000; // 30 minutes in milliseconds
                        const now = Date.now();

                        if (cachedData && now - cachedData.timestamp < cacheExpiration) {
                            setMethodName(cachedData.methodName);
                            return;
                        }

                        // If we're already at max concurrent requests, queue this one
                        if (activeRequests.size >= MAX_CONCURRENT_REQUESTS) {
                            if (!requestQueue.includes(logId) && !activeRequests.has(logId)) {
                                requestQueue.push(logId);
                                setIsQueued(true);
                            }
                        } else if (!activeRequests.has(logId)) {
                            setShouldFetch(true);
                        }
                    }
                });
            },
            { threshold: 0.1 },
        );
        observer.observe(node);
        return () => {
            observer.unobserve(node);
            // If this component is unmounted while in the queue, remove it
            const queueIndex = requestQueue.indexOf(logId);
            if (queueIndex > -1) {
                requestQueue.splice(queueIndex, 1);
            }
        };
    }, [logId]);

    useEffect(() => {
        if (!shouldFetch) return;
        let cancelled = false;

        // Add to active requests set
        activeRequests.add(logId);

        // Clear any existing timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        const fetchMethodName = async () => {
            // Check if we have a cached value that's less than 30 minutes old
            const cachedData = methodNameCache[logId];
            const cacheExpiration = 30 * 60 * 1000; // 30 minutes in milliseconds
            const now = Date.now();

            if (cachedData && now - cachedData.timestamp < cacheExpiration) {
                setMethodName(cachedData.methodName);
                activeRequests.delete(logId);
                processNextInQueue();
                return;
            }

            if (!window.callServerApi) return;
            setLoading(true);
            setError(null);

            // Set a timeout to prevent the spinner from being stuck
            timeoutRef.current = setTimeout(() => {
                if (!cancelled) {
                    setLoading(false);
                    setError('Request timed out');
                    // Add to cache to prevent immediate retry
                    methodNameCache[logId] = {
                        methodName: 'TIMEOUT',
                        timestamp: now,
                    };
                }
                activeRequests.delete(logId);
                processNextInQueue();
            }, 10000); // 10 second timeout

            try {
                const response: MethodNameResponse = await window.callServerApi(`/api/debugLogs/${logId}/methodName`);
                // Clear the timeout since we got a response
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }

                if (response?.success) {
                    const newMethodName = response.methodName;
                    if (!cancelled) setMethodName(newMethodName);
                    methodNameCache[logId] = {
                        methodName: newMethodName,
                        timestamp: now,
                    };
                } else {
                    if (!cancelled) setError('Failed to fetch method name');
                }
            } catch (error) {
                // Clear the timeout since we got an error
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }

                console.error('Error fetching method name:', error);
                if (!cancelled) setError('Error fetching method name');
            } finally {
                if (!cancelled) setLoading(false);
                activeRequests.delete(logId);
                processNextInQueue();
            }
        };

        fetchMethodName();

        return () => {
            cancelled = true;
            // Clear timeout on cleanup
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            // Remove from active requests and process next in queue
            activeRequests.delete(logId);
            processNextInQueue();
        };
    }, [logId, shouldFetch]);

    if (loading) {
        return <CircularProgress size={16} />;
    }
    if (isQueued) {
        return <span style={{ color: 'gray', fontStyle: 'italic' }}>Queued...</span>;
    }
    if (error) {
        return (
            <Tooltip title={error}>
                <span>Error</span>
            </Tooltip>
        );
    }
    // Always display a tooltip with the full method name
    return (
        <Tooltip title={methodName || 'No method found'}>
            <span ref={ref} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {methodName || 'N/A'}
            </span>
        </Tooltip>
    );
}

// Add type for delete response
interface DeleteLogsResponse {
    success: boolean;
    deleted?: number;
    failed?: number;
    total?: number;
    error?: string;
}

export default function DebugLogFetcher() {
    const [logs, setLogs] = useState<Log[]>([]);
    const [loading, setLoading] = useState(false);
    const [downloadingLogId, setDownloadingLogId] = useState<string | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUser, setSelectedUser] = useState<User | { Id: string; Name: string } | null>(null);
    const [currentUser, setCurrentUser] = useState<{ display_name: string; username: string } | null>(null);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
        open: false,
        message: '',
        severity: 'success',
    });
    const [pendingDelete, setPendingDelete] = useState<{ userName: string | null } | null>(null);
    const [logSize, setLogSize] = useState<string>('');
    const [logSizeDirection, setLogSizeDirection] = useState<'above' | 'below'>('above');

    // Fetch users for the autocomplete dropdown
    const fetchUsers = async (searchTerm: string = '') => {
        if (!window.callServerApi) return;

        setLoadingUsers(true);
        try {
            const response: UsersResponse = await window.callServerApi(
                `/api/users${searchTerm ? `?search=${searchTerm}` : ''}`,
            );

            if (response?.success) {
                setUsers(response.users || []);

                // Set current user information
                if (response.currentUser && !currentUser) {
                    setCurrentUser(response.currentUser);

                    // Create a user object from the current user info
                    const currentUserObj = {
                        Id: 'current',
                        Name: response.currentUser.display_name,
                    };

                    // Set as selected user on first load
                    setSelectedUser(currentUserObj);
                }
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_) {
            /* empty */
        } finally {
            setLoadingUsers(false);
        }
    };

    const fetchLogs = async (userFilter: string | null = null, size?: string, sizeDirection?: 'above' | 'below') => {
        if (!window.callServerApi) return;

        setLoading(true);
        try {
            let endpoint = '/api/debugLogs';
            const params = [];
            if (userFilter && userFilter !== 'all') {
                params.push(`user=${encodeURIComponent(userFilter)}`);
            }
            if (size && size !== '') {
                params.push(`size=${encodeURIComponent(size)}`);
            }
            if (sizeDirection) {
                params.push(`sizeDirection=${encodeURIComponent(sizeDirection)}`);
            }
            if (params.length > 0) {
                endpoint += `?${params.join('&')}`;
            }
            const response: Response = await window.callServerApi(endpoint);
            if (response?.success) {
                setLogs(response?.logs?.records || []);
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_) {
            /* empty */
        } finally {
            setLoading(false);
        }
    };

    // Handle user selection change
    const handleUserChange = (_event: React.SyntheticEvent, newValue: User | { Id: string; Name: string } | null) => {
        setSelectedUser(newValue);
        if (newValue === null) {
            fetchLogs('all', logSize, logSizeDirection);
        } else if (newValue.Id === 'all') {
            fetchLogs('all', logSize, logSizeDirection);
        } else {
            fetchLogs(newValue.Name, logSize, logSizeDirection);
        }
    };

    // Download and open the full log in VS Code
    const downloadFullLog = async (logId: string) => {
        if (!window.callServerApi) return;

        try {
            setDownloadingLogId(logId);

            // Find the log to get its size for better UX feedback

            await window.callServerApi(`/api/debugLogs/${logId}/download`);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_) {
            /* empty */
        } finally {
            setDownloadingLogId(null);
        }
    };

    // Clear method name cache when refreshing logs
    const handleRefresh = () => {
        // Refresh logs with the current user filter
        if (selectedUser === null) {
            fetchLogs('all', logSize, logSizeDirection);
        } else {
            fetchLogs(selectedUser.Name, logSize, logSizeDirection);
        }
    };

    // Delete logs handler
    const handleDeleteLogs = async (userName: string | null) => {
        if (!window.callServerApi) return;
        setDeleting(true);
        try {
            const response: unknown = await window.callServerApi('/api/debugLogs/delete', 'POST', { userName });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const isDeleteResponse = (resp: any): resp is DeleteLogsResponse =>
                typeof resp === 'object' && resp !== null && 'success' in resp;
            if (isDeleteResponse(response) && response.success) {
                setSnackbar({
                    open: true,
                    message: `Deleted ${response.deleted ?? 0} logs${response.failed && response.failed > 0 ? ', failed: ' + response.failed : ''}`,
                    severity: 'success',
                });
                fetchLogs(userName && userName !== 'all' ? userName : 'all');
            } else {
                setSnackbar({
                    open: true,
                    message:
                        'Failed to delete logs: ' +
                        (isDeleteResponse(response) && response.error ? response.error : 'Unknown error'),
                    severity: 'error',
                });
            }
        } catch (e) {
            setSnackbar({
                open: true,
                message: 'Error deleting logs: ' + (e instanceof Error ? e.message : String(e)),
                severity: 'error',
            });
        } finally {
            setDeleting(false);
        }
    };

    // Handle log size change
    const handleLogSizeChange = (value: string) => {
        setLogSize(value);
        fetchLogs(selectedUser ? selectedUser.Name : 'all', value, logSizeDirection);
    };

    // Handle log size direction change
    const handleLogSizeDirectionChange = (direction: 'above' | 'below') => {
        setLogSizeDirection(direction);
        fetchLogs(selectedUser ? selectedUser.Name : 'all', logSize, direction);
    };

    // Initial data load
    useEffect(() => {
        // Fetch users first to get current user
        fetchUsers();
        // Logs will be fetched after current user is set
    }, []);

    // Fetch logs when current user is set or log size filter changes
    useEffect(() => {
        if (selectedUser) {
            fetchLogs(selectedUser.Name, logSize, logSizeDirection);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser]);

    // Format the date to be more readable
    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            return date.toLocaleString();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_) {
            return dateString;
        }
    };

    // Format log length to show KB
    const formatLogLength = (length: number) => {
        return `${length.toLocaleString()} bytes`;
    };

    return (
        <Card
            sx={{
                borderRadius: '0.25rem',
                height: 'calc(100% - 1rem)',
                maxHeight: 'calc(100% - 1rem)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            <Grid sx={{ p: '1rem', justifyContent: 'center', alignItems: 'center' }} container spacing={1}>
                {/* User filter */}
                <Grid sx={{ height: '100%' }}>
                    <Autocomplete
                        sx={{ width: '20rem', height: '100%' }}
                        options={[
                            { Id: 'all', Name: 'All Users' },
                            ...(selectedUser &&
                            selectedUser.Id !== 'all' &&
                            selectedUser.Id !== 'current' &&
                            !users.some((u) => u.Id === selectedUser.Id)
                                ? [selectedUser]
                                : []),
                            ...users,
                        ]}
                        getOptionLabel={(option) => option.Name}
                        renderOption={(props, option) => (
                            <li {...props}>
                                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                    <Typography variant="body1">{option.Name}</Typography>
                                    {option.Id !== 'all' && option.Id !== 'current' && 'Username' in option && (
                                        <Typography variant="caption" color="text.secondary">
                                            {(option as User).Username}
                                        </Typography>
                                    )}
                                </Box>
                            </li>
                        )}
                        isOptionEqualToValue={(option, value) => option.Id === value.Id}
                        loading={loadingUsers}
                        loadingText="Searching..."
                        value={selectedUser}
                        onChange={handleUserChange}
                        onInputChange={(_, newInputValue) => {
                            if (newInputValue && newInputValue.length > 1) {
                                fetchUsers(newInputValue);
                            }
                        }}
                        filterOptions={(x) => x} // Disable client-side filtering, rely on server search
                        noOptionsText="Type to search users..."
                        renderInput={(params) => {
                            // Adornment components
                            const startAdornment = (
                                <FilterListIcon fontSize="small" sx={{ mr: 0.5, color: 'action.active' }} />
                            );

                            const endAdornment = (
                                <>
                                    {loadingUsers && <CircularProgress size={20} />}
                                    {params.InputProps.endAdornment}
                                </>
                            );

                            return (
                                <TextField
                                    {...params}
                                    label="Filter by User"
                                    placeholder="Start typing..."
                                    variant="outlined"
                                    size="small"
                                    // Use slotProps instead of InputProps
                                    slotProps={{
                                        input: {
                                            ...params.InputProps, // Spread the original InputProps to maintain functionality
                                            startAdornment: startAdornment,
                                            endAdornment: endAdornment,
                                        },
                                    }}
                                />
                            );
                        }}
                    />
                </Grid>

                {/* Refresh logs */}
                <Grid sx={{ height: '100%' }}>
                    <Tooltip title="Refresh logs">
                        <IconButton sx={{ height: '100%' }} onClick={handleRefresh} disabled={loading}>
                            <RefreshIcon />
                        </IconButton>
                    </Tooltip>
                </Grid>

                {/* Divider */}
                <Divider orientation="vertical" flexItem />

                {/* Delete logs for selected user */}
                <Grid sx={{ height: '100%' }}>
                    <Tooltip title="Delete logs for selected user">
                        <IconButton
                            color="error"
                            size="small"
                            disabled={loading || deleting || !selectedUser || selectedUser.Id === 'all'}
                            onClick={() => setPendingDelete({ userName: selectedUser ? selectedUser.Name : null })}
                            sx={{
                                backgroundColor: 'error.main',
                                color: 'common.white',
                                borderRadius: 1,
                                '&:hover': {
                                    backgroundColor: 'error.dark',
                                },
                                boxShadow: 1,
                                height: '100%',
                            }}
                        >
                            <PersonRemoveIcon />
                        </IconButton>
                    </Tooltip>
                </Grid>

                {/* Delete all logs */}
                <Grid sx={{ height: '100%' }}>
                    <Tooltip title="Delete all logs">
                        <IconButton
                            color="error"
                            size="small"
                            disabled={loading || deleting}
                            onClick={() => setPendingDelete({ userName: null })}
                            sx={{
                                backgroundColor: 'error.main',
                                color: 'common.white',
                                borderRadius: 1,
                                '&:hover': {
                                    backgroundColor: 'error.dark',
                                },
                                boxShadow: 1,
                                height: '100%',
                            }}
                        >
                            <DeleteSweepIcon />
                        </IconButton>
                    </Tooltip>
                </Grid>

                {/* Spacer */}
                <Grid sx={{ flexGrow: 1, height: '100%' }}></Grid>

                {/* Log Size Filter Controls */}
                <Grid sx={{ height: '100%' }}>
                    <TextField
                        sx={{ height: '100%' }}
                        label="Log Size (bytes)"
                        type="number"
                        size="small"
                        value={logSize}
                        onChange={(e) => handleLogSizeChange(e.target.value)}
                        slotProps={{
                            input: {
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <Tooltip
                                            title={
                                                logSizeDirection === 'above'
                                                    ? 'Show logs larger than this size'
                                                    : 'Show logs smaller than this size'
                                            }
                                        >
                                            <IconButton
                                                size="small"
                                                onClick={() =>
                                                    handleLogSizeDirectionChange(
                                                        logSizeDirection === 'above' ? 'below' : 'above',
                                                    )
                                                }
                                                edge="end"
                                            >
                                                {logSizeDirection === 'above' ? (
                                                    <KeyboardArrowUpIcon />
                                                ) : (
                                                    <KeyboardArrowDownIcon />
                                                )}
                                            </IconButton>
                                        </Tooltip>
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />
                </Grid>
            </Grid>

            {(loading || deleting) && <LinearProgress sx={{ flexShrink: 0 }} />}

            <TableContainer component={Paper}>
                <Table
                    stickyHeader
                    aria-label="debug logs table"
                    size="small"
                    sx={{ minWidth: 900 }} // Set a minimum width to ensure horizontal scrolling when needed
                >
                    <TableHead>
                        <TableRow>
                            <TableCell>
                                <Tooltip title="User who created this debug log">
                                    <span>Logged By User</span>
                                </Tooltip>
                            </TableCell>
                            <TableCell>
                                <Tooltip title="Size of the debug log in bytes">
                                    <span>Log Length</span>
                                </Tooltip>
                            </TableCell>
                            <TableCell>
                                <Tooltip title="Date and time when the log was created">
                                    <span>Start Time</span>
                                </Tooltip>
                            </TableCell>
                            <TableCell>
                                <Tooltip title="Operation that generated this log">
                                    <span>Operation</span>
                                </Tooltip>
                            </TableCell>
                            <TableCell>
                                <Tooltip title="Application that generated this log">
                                    <span>Application</span>
                                </Tooltip>
                            </TableCell>
                            <TableCell>
                                <Tooltip title="Success or error status of the operation">
                                    <span>Status</span>
                                </Tooltip>
                            </TableCell>
                            <TableCell>
                                <Tooltip title="Primary method executed in this debug log">
                                    <span>Method Name</span>
                                </Tooltip>
                            </TableCell>
                            <TableCell align="center">{/* Actions column with empty header text */}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {logs?.length === 0 && !loading ? (
                            <TableRow>
                                <TableCell colSpan={10} align="center">
                                    <Typography variant="body2" sx={{ py: 2 }}>
                                        No logs found. Click refresh to fetch logs.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            logs?.map((log) => (
                                <TableRow key={log.Id} hover>
                                    <TableCell>
                                        <Tooltip title={log.LogUser.Name}>
                                            <span>{log.LogUser.Name}</span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell>
                                        <Tooltip title={formatLogLength(log.LogLength)}>
                                            <span>{formatLogLength(log.LogLength)}</span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell>
                                        <Tooltip title={formatDate(log.StartTime)}>
                                            <span>{formatDate(log.StartTime)}</span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell className="scrollable" sx={{ maxWidth: '150px' }}>
                                        <Tooltip title={log.Operation}>
                                            <span>{log.Operation}</span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell className="scrollable">
                                        <Tooltip title={log.Application}>
                                            <span>{log.Application}</span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell className="scrollable" sx={{ maxWidth: '100px' }}>
                                        <Tooltip title={log.Status}>
                                            <span>
                                                <Chip
                                                    label={log.Status}
                                                    size="small"
                                                    color={log.Status === 'Success' ? 'success' : 'error'}
                                                    variant="outlined"
                                                />
                                            </span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell sx={{ minWidth: '250px' }}>
                                        <MethodName logId={log.Id} />
                                    </TableCell>
                                    <TableCell align="center">
                                        <Tooltip
                                            title={
                                                downloadingLogId === log.Id
                                                    ? 'Opening in VS Code...'
                                                    : 'Download and open in VS Code'
                                            }
                                        >
                                            <span>
                                                {' '}
                                                {/* Wrapper needed for disabled tooltip */}
                                                <IconButton
                                                    size="small"
                                                    onClick={() => downloadFullLog(log.Id)}
                                                    disabled={downloadingLogId !== null}
                                                    color="primary"
                                                >
                                                    {downloadingLogId === log.Id ? (
                                                        <CircularProgress size={18} thickness={5} color="primary" />
                                                    ) : (
                                                        <DownloadIcon fontSize="small" />
                                                    )}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                    severity={snackbar.severity}
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
            {/* Confirmation Modal for Delete */}
            <Dialog
                open={!!pendingDelete}
                onClose={() => setPendingDelete(null)}
                aria-labelledby="delete-confirmation-dialog-title"
            >
                <DialogTitle id="delete-confirmation-dialog-title">Confirm Deletion</DialogTitle>
                <DialogContent>
                    {pendingDelete?.userName
                        ? `Are you sure you want to delete logs for "${pendingDelete.userName}"?`
                        : 'Are you sure you want to delete all logs?'}
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => setPendingDelete(null)}
                        color="primary"
                        variant="outlined"
                        disabled={deleting}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            handleDeleteLogs(pendingDelete?.userName ?? null);
                            setPendingDelete(null);
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
        </Card>
    );
}

