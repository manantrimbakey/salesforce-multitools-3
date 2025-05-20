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

    return (
        <Tooltip title={methodName || 'No method found'}>
            <span>{methodName || 'N/A'}</span>
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
                mb: 2,
                height: 'calc(100% - 1rem)',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <Box
                sx={{
                    p: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: 1,
                    borderColor: 'divider',
                }}
            >
                <Typography variant="h6" component="div">
                    Debug Logs
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Autocomplete
                        sx={{ width: 250 }}
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
                        isOptionEqualToValue={(option, value) => option.Id === value.Id}
                        loading={loadingUsers}
                        value={selectedUser}
                        onChange={handleUserChange}
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

            {loading && <LinearProgress />}

            <TableContainer sx={{ flexGrow: 1 }} component={Paper}>
                <Table stickyHeader size="small" aria-label="debug logs table">
                    <TableHead>
                        <TableRow>
                            <TableCell>Log Id</TableCell>
                            <TableCell>Logged By User</TableCell>
                            <TableCell>Log Length</TableCell>
                            <TableCell>Start Time</TableCell>
                            <TableCell>Operation</TableCell>
                            <TableCell>Application</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Method Name</TableCell>
                            <TableCell>Request Identifier</TableCell>
                            <TableCell align="center">Actions</TableCell>
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
                                    <TableCell
                                        sx={{
                                            maxWidth: '180px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            cursor: 'pointer',
                                            '&:hover': { textDecoration: 'underline' },
                                        }}
                                        title={log.Id}
                                    >
                                        {log.Id}
                                    </TableCell>
                                    <TableCell>{log.LogUser.Name}</TableCell>
                                    <TableCell>{formatLogLength(log.LogLength)}</TableCell>
                                    <TableCell>{formatDate(log.StartTime)}</TableCell>
                                    <TableCell>{log.Operation}</TableCell>
                                    <TableCell>{log.Application}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={log.Status}
                                            size="small"
                                            color={log.Status === 'Success' ? 'success' : 'error'}
                                            variant="outlined"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <MethodName logId={log.Id} />
                                    </TableCell>
                                    <TableCell
                                        sx={{
                                            maxWidth: '180px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                        title={log.RequestIdentifier}
                                    >
                                        {log.RequestIdentifier}
                                    </TableCell>
                                    <TableCell align="center">
                                        <Tooltip title="Download and open in VS Code">
                                            <IconButton
                                                size="small"
                                                onClick={() => downloadFullLog(log.Id)}
                                                disabled={downloadingLogId === log.Id}
                                                color="primary"
                                            >
                                                <DownloadIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Card>
    );
}
