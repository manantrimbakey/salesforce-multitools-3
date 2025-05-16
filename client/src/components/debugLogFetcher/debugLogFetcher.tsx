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
    Grid
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';
import { useVSCodeApi } from '../../App';

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

export default function DebugLogFetcher() {
    const vscode = useVSCodeApi();
    const [logs, setLogs] = useState<DebugLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('');
    const [selectedUser, setSelectedUser] = useState('ALL');
    const [users, setUsers] = useState<string[]>(['ALL']);
    const [selectedLog, setSelectedLog] = useState<string | null>(null);

    useEffect(() => {
        // Handle messages from VS Code
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;

            if (message.command === 'debugLogsLoaded') {
                setLogs(message.data.logs || []);
                
                // Extract unique users from logs
                if (message.data.logs && message.data.logs.length) {
                    const uniqueUsers = Array.from(
                        new Set(message.data.logs.map((log: DebugLog) => log.logUser))
                    ) as string[];
                    setUsers(['ALL', ...uniqueUsers]);
                }
                
                setLoading(false);
            } else if (message.command === 'debugLogDeleted') {
                // Refresh logs after deletion
                fetchLogs();
            }
        };

        // Add event listener
        window.addEventListener('message', handleMessage);

        // Initial fetch of logs
        fetchLogs();

        // Clean up
        return () => {
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    const fetchLogs = () => {
        setLoading(true);
        vscode.postMessage({ 
            command: 'fetchDebugLogs'
        });
    };

    const handleViewLog = (logId: string) => {
        setSelectedLog(logId);
        vscode.postMessage({
            command: 'viewDebugLog',
            data: { logId }
        });
    };

    const handleDeleteLog = (logId: string) => {
        vscode.postMessage({
            command: 'deleteDebugLog',
            data: { logId }
        });
    };

    const handleDownloadLog = (logId: string) => {
        vscode.postMessage({
            command: 'downloadDebugLog',
            data: { logId }
        });
    };

    // Filter logs based on user selection and text filter
    const filteredLogs = logs.filter(log => {
        const matchesUser = selectedUser === 'ALL' || log.logUser === selectedUser;
        const matchesFilter = filter === '' || 
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
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid size={6} display="flex" alignItems="center">
                        <Typography variant="h6">Salesforce Debug Logs</Typography>
                    </Grid>
                    <Grid size={6} display="flex" justifyContent="flex-end">
                        <Button 
                            variant="contained" 
                            startIcon={<RefreshIcon />}
                            onClick={fetchLogs}
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
                                startAdornment: <FilterListIcon sx={{ mr: 1, color: 'action.active' }} />
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
                                {users.map(user => (
                                    <MenuItem key={user} value={user}>{user}</MenuItem>
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