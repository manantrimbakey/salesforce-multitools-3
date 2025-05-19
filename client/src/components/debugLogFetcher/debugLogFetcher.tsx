import { useState, useEffect } from 'react';
import {
    Card,
    CardContent,
    Typography,
    TextField,
    Button,
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Tooltip,
    CircularProgress,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Chip,
    Grid,
    Alert,
    AlertTitle,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import SignalWifiStatusbar4BarIcon from '@mui/icons-material/SignalWifiStatusbar4Bar';
import SignalWifiOffIcon from '@mui/icons-material/SignalWifiOff';
import { useVSCodeApi } from '../../App';

// Extend window interface to include server properties
declare global {
    interface Window {
        serverBaseUrl?: string;
        callServerApi?: <T>(endpoint: string, method?: string, data?: unknown) => Promise<T>;
    }
}

// Interface for debug log data
interface DebugLog {
    id: string;
    logUser: string;
    logLength: number;
    operation: string;
    application: string;
    status: string;
    logDate: string;
    requestId: string;
}

// Interface for server status
interface ServerStatus {
    status: 'connected' | 'disconnected' | 'checking';
    url?: string;
    uptime?: number;
    timestamp?: string;
    error?: string;
}

// Interface for server status response
interface ServerStatusResponse {
    status: string;
    uptime: number;
    port: number;
    timestamp: string;
}

// Interface for debug logs response
interface DebugLogsResponse {
    success: boolean;
    logs: DebugLog[];
    message?: string;
    error?: string;
}

export default function DebugLogFetcher() {
    const vscode = useVSCodeApi();
    const [logs, setLogs] = useState<DebugLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('');
    const [selectedUser, setSelectedUser] = useState('ALL');
    const [users, setUsers] = useState<string[]>(['ALL']);
    const [selectedLog, setSelectedLog] = useState<string | null>(null);
    const [serverStatus, setServerStatus] = useState<ServerStatus>({
        status: 'checking',
    });

    useEffect(() => {
        // Check server connection
        checkServerConnection();

        // Handle messages from VS Code
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            if (message.command === 'debugLogsLoaded') {
                setLogs(message.data.logs || []);

                // Extract unique users from logs
                if (message.data.logs && message.data.logs.length) {
                    const uniqueUsers = Array.from(
                        new Set(message.data.logs.map((log: DebugLog) => log.logUser)),
                    ) as string[];
                    setUsers(['ALL', ...uniqueUsers]);
                }

                setLoading(false);
            } else if (message.command === 'debugLogDeleted') {
                // Refresh logs after deletion
                fetchLogs();
            } else if (message.command === 'serverStatus') {
                // Update server status
                setServerStatus({
                    status: message.data.connected ? 'connected' : 'disconnected',
                    url: message.data.url,
                    uptime: message.data.uptime,
                    timestamp: message.data.timestamp,
                    error: message.data.error,
                });
            }
        };

        // Add event listener
        window.addEventListener('message', handleMessage);

        // Initial fetch of logs
        fetchLogs();

        // Check server status every 30 seconds
        const intervalId = setInterval(checkServerConnection, 30000);

        // Clean up
        return () => {
            window.removeEventListener('message', handleMessage);
            clearInterval(intervalId);
        };
    }, []);

    const checkServerConnection = () => {
        // Check if we have a serverBaseUrl from the global window object
        // This is injected by the webviewUtils.ts script
        if (window.serverBaseUrl && window.callServerApi) {
            setServerStatus({ status: 'checking' });

            // Try to ping the server using callServerApi to include the extension token
            window.callServerApi<ServerStatusResponse>('/api/status')
                .then((data) => {
                    setServerStatus({
                        status: 'connected',
                        url: window.serverBaseUrl,
                        uptime: data.uptime,
                        timestamp: data.timestamp,
                    });
                })
                .catch(() => {
                    // Don't log error details to console for security
                    // Fall back to VS Code message
                    fallbackToVSCodeAPI();
                });
        } else {
            setServerStatus({
                status: 'disconnected',
                error: 'Server URL not found',
            });
        }
    };

    const fetchLogs = () => {
        setLoading(true);

        // If server is connected, try to fetch logs from server
        if (serverStatus.status === 'connected' && window.serverBaseUrl && window.callServerApi) {
            // Use callServerApi to include the extension token
            window.callServerApi<DebugLogsResponse>('/api/debugLogs')
                .then((data) => {
                    if (data.success) {
                        // Check if we got placeholder data (empty logs with a message)
                        if (data.logs && data.logs.length === 0 && data.message) {
                            // This is just a placeholder, fall back to VS Code API
                            fallbackToVSCodeAPI();
                            return;
                        }

                        setLogs(data.logs || []);

                        // Extract unique users from logs
                        if (data.logs && data.logs.length) {
                            const uniqueUsers = Array.from(
                                new Set(data.logs.map((log: DebugLog) => log.logUser)),
                            ) as string[];
                            setUsers(['ALL', ...uniqueUsers]);
                        }

                        setLoading(false);
                    } else {
                        throw new Error(data.error || 'Unknown error');
                    }
                })
                .catch(() => {
                    // Don't log error details to console for security
                    // Fall back to VS Code message
                    fallbackToVSCodeAPI();
                });
        } else {
            // Fall back to VS Code message
            fallbackToVSCodeAPI();
        }
    };

    const fallbackToVSCodeAPI = () => {
        vscode.postMessage({
            command: 'fetchDebugLogs',
        });
    };

    const handleViewLog = (logId: string) => {
        setSelectedLog(logId);
        vscode.postMessage({
            command: 'viewDebugLog',
            data: { logId },
        });
    };

    const handleDeleteLog = (logId: string) => {
        vscode.postMessage({
            command: 'deleteDebugLog',
            data: { logId },
        });
    };

    const handleDownloadLog = (logId: string) => {
        vscode.postMessage({
            command: 'downloadDebugLog',
            data: { logId },
        });
    };

    // Server status indicator component - hide server URL details
    const ServerStatusIndicator = () => {
        if (serverStatus.status === 'checking') {
            return (
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <CircularProgress size={16} sx={{ mr: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                        Checking server connection...
                    </Typography>
                </Box>
            );
        } else if (serverStatus.status === 'connected') {
            return (
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <SignalWifiStatusbar4BarIcon color="success" fontSize="small" sx={{ mr: 1 }} />
                    <Typography variant="body2" color="success.main">
                        Server connected
                    </Typography>
                </Box>
            );
        } else {
            return (
                <Alert severity="warning" sx={{ mb: 1 }}>
                    <AlertTitle>Server Connection Issue</AlertTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <SignalWifiOffIcon fontSize="small" sx={{ mr: 1 }} />
                        <Typography variant="body2">Cannot connect to server</Typography>
                    </Box>
                    <Typography variant="caption">Falling back to VS Code API for log retrieval</Typography>
                </Alert>
            );
        }
    };

    // Filter logs based on user selection and text filter
    const filteredLogs = logs.filter((log) => {
        const matchesUser = selectedUser === 'ALL' || log.logUser === selectedUser;
        const matchesFilter =
            filter === '' ||
            log.operation.toLowerCase().includes(filter.toLowerCase()) ||
            log.application.toLowerCase().includes(filter.toLowerCase()) ||
            log.status.toLowerCase().includes(filter.toLowerCase());

        return matchesUser && matchesFilter;
    });

    // Format date for display
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    // Format size in KB
    const formatSize = (bytes: number) => {
        return (bytes / 1024).toFixed(2) + ' KB';
    };

    return (
        <Card sx={{ borderRadius: '0.25rem', mb: 2 }}>
            <CardContent>
                {/* Server Status Indicator */}
                <ServerStatusIndicator />

                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid size={6} display="flex" alignItems="center">
                        <Typography variant="h6">Salesforce Debug Logs</Typography>
                    </Grid>
                    <Grid size={6} display="flex" justifyContent="flex-end">
                        <Button
                            variant="contained"
                            startIcon={<RefreshIcon />}
                            onClick={() => {
                                fetchLogs();
                                checkServerConnection();
                            }}
                            disabled={loading}
                        >
                            {loading ? <CircularProgress size={24} /> : 'Refresh Logs'}
                        </Button>
                    </Grid>
                </Grid>

                <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid size={{ xs: 12, sm: 9 }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Filter logs by operation, application, or status"
                            variant="outlined"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            InputProps={{
                                startAdornment: <FilterListIcon sx={{ mr: 1, color: 'action.active' }} />,
                            }}
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 3 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel id="user-select-label">User</InputLabel>
                            <Select
                                labelId="user-select-label"
                                value={selectedUser}
                                label="User"
                                onChange={(e) => setSelectedUser(e.target.value)}
                            >
                                {users.map((user) => (
                                    <MenuItem key={user} value={user}>
                                        {user}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                </Grid>

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <>
                        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>User</TableCell>
                                        <TableCell>Operation</TableCell>
                                        <TableCell>Application</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Date</TableCell>
                                        <TableCell>Size</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredLogs.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} align="center">
                                                No logs found
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredLogs.map((log) => (
                                            <TableRow
                                                key={log.id}
                                                hover
                                                onClick={() => handleViewLog(log.id)}
                                                selected={selectedLog === log.id}
                                                sx={{ cursor: 'pointer' }}
                                            >
                                                <TableCell>{log.logUser}</TableCell>
                                                <TableCell>{log.operation}</TableCell>
                                                <TableCell>{log.application}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={log.status}
                                                        size="small"
                                                        color={log.status === 'Success' ? 'success' : 'default'}
                                                    />
                                                </TableCell>
                                                <TableCell>{formatDate(log.logDate)}</TableCell>
                                                <TableCell>{formatSize(log.logLength)}</TableCell>
                                                <TableCell align="right">
                                                    <Tooltip title="Download Log">
                                                        <IconButton
                                                            size="small"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDownloadLog(log.id);
                                                            }}
                                                        >
                                                            <DownloadIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Delete Log">
                                                        <IconButton
                                                            size="small"
                                                            color="error"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteLog(log.id);
                                                            }}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
                            {filteredLogs.length} logs found • Click on a row to view log details
                        </Typography>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
