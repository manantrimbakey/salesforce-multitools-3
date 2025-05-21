import { useState, useEffect } from 'react';
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
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import FilterListIcon from '@mui/icons-material/FilterList';

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

declare type DownloadResponse = {
    success: boolean;
    message: string;
    size: number;
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

// Method Name Component
function MethodName({ logId }: { logId: string }) {
    const [methodName, setMethodName] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchMethodName = async () => {
            // Check if we have a cached value that's less than 30 minutes old
            const cachedData = methodNameCache[logId];
            const cacheExpiration = 30 * 60 * 1000; // 30 minutes in milliseconds
            const now = Date.now();

            if (cachedData && now - cachedData.timestamp < cacheExpiration) {
                // Use cached value
                setMethodName(cachedData.methodName);
                return;
            }

            // No valid cache, fetch from API
            if (!window.callServerApi) return;

            setLoading(true);
            setError(null);

            try {
                const response: MethodNameResponse = await window.callServerApi(`/api/debugLogs/${logId}/methodName`);

                if (response?.success) {
                    const newMethodName = response.methodName;
                    setMethodName(newMethodName);

                    // Store in cache
                    methodNameCache[logId] = {
                        methodName: newMethodName,
                        timestamp: now,
                    };
                } else {
                    setError('Failed to fetch method name');
                }
            } catch (err) {
                console.error('Error fetching method name:', err);
                setError('Error fetching method name');
            } finally {
                setLoading(false);
            }
        };

        fetchMethodName();
    }, [logId]);

    if (loading) {
        return <CircularProgress size={16} />;
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
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {methodName || 'N/A'}
            </span>
        </Tooltip>
    );
}

export default function DebugLogFetcher() {
    const [logs, setLogs] = useState<Log[]>([]);
    const [loading, setLoading] = useState(false);
    const [downloadingLogId, setDownloadingLogId] = useState<string | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUser, setSelectedUser] = useState<User | { Id: string; Name: string } | null>(null);
    const [currentUser, setCurrentUser] = useState<{ display_name: string; username: string } | null>(null);
    const [loadingUsers, setLoadingUsers] = useState(false);

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
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoadingUsers(false);
        }
    };

    const fetchLogs = async (userFilter: string | null = null) => {
        if (!window.callServerApi) return;

        setLoading(true);
        try {
            let endpoint = '/api/debugLogs';

            // Add user filter if provided
            if (userFilter && userFilter !== 'all') {
                endpoint += `?user=${encodeURIComponent(userFilter)}`;
            }

            const response: Response = await window.callServerApi(endpoint);

            console.log(
                `%cresponse: %c${JSON.stringify(response)}`,
                'padding: 0.5rem; color: white; font-weight: bold; background-color: blue;',
                'padding: 0.5rem; color: black; background-color: gold;',
            );

            if (response?.success) {
                setLogs(response?.logs?.records || []);
            }
        } catch (error) {
            console.error('Error fetching logs:', error);
        } finally {
            setLoading(false);
        }
    };

    // Handle user selection change
    const handleUserChange = (_event: React.SyntheticEvent, newValue: User | { Id: string; Name: string } | null) => {
        setSelectedUser(newValue);

        if (newValue === null) {
            // Show all logs
            fetchLogs('all');
        } else if (newValue.Id === 'all') {
            // All Users option selected
            fetchLogs('all');
        } else {
            // Filter by selected user
            fetchLogs(newValue.Name);
        }
    };

    // Download and open the full log in VS Code
    const downloadFullLog = async (logId: string) => {
        if (!window.callServerApi) return;

        try {
            setDownloadingLogId(logId);

            // Find the log to get its size for better UX feedback
            const logDetails = logs.find((log) => log.Id === logId);
            const isLargeFile = logDetails && logDetails.LogLength > 5000000; // 5MB threshold

            if (isLargeFile) {
                console.log(
                    `Downloading large log file (${Math.round(logDetails!.LogLength / 1048576)}MB), this may take some time...`,
                );
            }

            const response: DownloadResponse = await window.callServerApi(`/api/debugLogs/${logId}/download`);

            if (response?.success) {
                console.log(`Log opened in VS Code: ${response.message}`);
            } else {
                console.error('Failed to open log in VS Code');
            }
        } catch (error) {
            console.error('Error downloading log:', error);
        } finally {
            setDownloadingLogId(null);
        }
    };

    // Clear method name cache when refreshing logs
    const handleRefresh = () => {
        // Refresh logs with the current user filter
        if (selectedUser === null) {
            fetchLogs('all');
        } else {
            fetchLogs(selectedUser.Name);
        }
    };

    // Initial data load
    useEffect(() => {
        // Fetch users first to get current user
        fetchUsers();
        // Logs will be fetched after current user is set
    }, []);

    // Fetch logs when current user is set
    useEffect(() => {
        if (selectedUser) {
            fetchLogs(selectedUser.Name);
        }
    }, [currentUser]);

    // Format the date to be more readable
    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            return date.toLocaleString();
        } catch (e) {
            console.error('Error formatting date:', e);
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
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            <Box
                sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    zIndex: 2, // Ensure it stays above the scrolling content
                    flexShrink: 0, // Prevent header from shrinking
                }}
            >
                <Typography variant="h6" component="div">
                    Debug Logs
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Autocomplete
                        sx={{ width: '20rem' }}
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
                    <Tooltip title="Refresh logs">
                        <IconButton onClick={handleRefresh} disabled={loading}>
                            <RefreshIcon />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            {loading && <LinearProgress sx={{ flexShrink: 0 }} />}

            <Box
                sx={{
                    flexGrow: 1,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    height: 0, // This is key for flex children to correctly size
                }}
            >
                <TableContainer
                    component={Paper}
                    sx={{
                        flexGrow: 1,
                        overflow: 'auto',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        maxWidth: '100%',
                    }}
                >
                    <Table
                        stickyHeader
                        aria-label="debug logs table"
                        size="small"
                        sx={{ minWidth: 900 }} // Set a minimum width to ensure horizontal scrolling when needed
                    >
                        <TableHead>
                            <TableRow>
                                <TableCell
                                    sx={{
                                        bgcolor: 'background.paper',
                                        zIndex: 1,
                                        position: 'sticky',
                                        top: 0,
                                    }}
                                >
                                    <Tooltip title="User who created this debug log">
                                        <span>Logged By User</span>
                                    </Tooltip>
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: 'background.paper',
                                        zIndex: 1,
                                        position: 'sticky',
                                        top: 0,
                                    }}
                                >
                                    <Tooltip title="Size of the debug log in bytes">
                                        <span>Log Length</span>
                                    </Tooltip>
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: 'background.paper',
                                        zIndex: 1,
                                        position: 'sticky',
                                        top: 0,
                                    }}
                                >
                                    <Tooltip title="Date and time when the log was created">
                                        <span>Start Time</span>
                                    </Tooltip>
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: 'background.paper',
                                        zIndex: 1,
                                        position: 'sticky',
                                        top: 0,
                                        maxWidth: '150px',
                                    }}
                                >
                                    <Tooltip title="Operation that generated this log">
                                        <span>Operation</span>
                                    </Tooltip>
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: 'background.paper',
                                        zIndex: 1,
                                        position: 'sticky',
                                        top: 0,
                                    }}
                                >
                                    <Tooltip title="Application that generated this log">
                                        <span>Application</span>
                                    </Tooltip>
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: 'background.paper',
                                        zIndex: 1,
                                        position: 'sticky',
                                        top: 0,
                                        maxWidth: '100px',
                                    }}
                                >
                                    <Tooltip title="Success or error status of the operation">
                                        <span>Status</span>
                                    </Tooltip>
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: 'background.paper',
                                        zIndex: 1,
                                        position: 'sticky',
                                        top: 0,
                                        minWidth: '250px',
                                    }}
                                >
                                    <Tooltip title="Primary method executed in this debug log">
                                        <span>Method Name</span>
                                    </Tooltip>
                                </TableCell>
                                <TableCell
                                    align="center"
                                    sx={{
                                        bgcolor: 'background.paper',
                                        zIndex: 1,
                                        position: 'sticky',
                                        top: 0,
                                    }}
                                >
                                    {/* Actions column with empty header text */}
                                </TableCell>
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
            </Box>
        </Card>
    );
}
