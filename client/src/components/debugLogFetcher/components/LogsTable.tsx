import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, Tooltip, IconButton, CircularProgress, Chip } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import { MethodNameCell } from './MethodNameCell';
import type { Log } from '../types';

interface Props {
    logs: Log[];
    loading: boolean;
    downloadingLogId: string | null;
    onDownloadFullLog: (logId: string) => void;
}

export const LogsTable: React.FC<Props> = ({ logs, loading, downloadingLogId, onDownloadFullLog }) => {
    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        try {
            return new Date(dateString).toLocaleString();
        } catch {
            return dateString;
        }
    };

    const formatLogLength = (length: number) => `${length.toLocaleString()} bytes`;

    return (
        <TableContainer component={Paper}>
            <Table stickyHeader size="small" sx={{ minWidth: 900 }}>
                <TableHead>
                    <TableRow>
                        <TableCell><Tooltip title="User who created this debug log"><span>Logged By User</span></Tooltip></TableCell>
                        <TableCell><Tooltip title="Size of the debug log in bytes"><span>Log Length</span></Tooltip></TableCell>
                        <TableCell><Tooltip title="Date and time when the log was created"><span>Start Time</span></Tooltip></TableCell>
                        <TableCell><Tooltip title="Operation that generated this log"><span>Operation</span></Tooltip></TableCell>
                        <TableCell><Tooltip title="Application that generated this log"><span>Application</span></Tooltip></TableCell>
                        <TableCell><Tooltip title="Success or error status of the operation"><span>Status</span></Tooltip></TableCell>
                        <TableCell><Tooltip title="Primary method executed in this debug log"><span>Method Name</span></Tooltip></TableCell>
                        <TableCell align="center" />
                    </TableRow>
                </TableHead>
                <TableBody>
                    {logs?.length === 0 && !loading ? (
                        <TableRow>
                            <TableCell colSpan={8} align="center">
                                <Typography variant="body2" sx={{ py: 2 }}>No logs found. Click refresh to fetch logs.</Typography>
                            </TableCell>
                        </TableRow>
                    ) : (
                        logs?.map((log) => (
                            <TableRow key={log.Id} hover>
                                <TableCell><Tooltip title={log.LogUser.Name}><span>{log.LogUser.Name}</span></Tooltip></TableCell>
                                <TableCell><Tooltip title={formatLogLength(log.LogLength)}><span>{formatLogLength(log.LogLength)}</span></Tooltip></TableCell>
                                <TableCell><Tooltip title={formatDate(log.StartTime)}><span>{formatDate(log.StartTime)}</span></Tooltip></TableCell>
                                <TableCell className="scrollable" sx={{ maxWidth: '150px' }}><Tooltip title={log.Operation}><span>{log.Operation}</span></Tooltip></TableCell>
                                <TableCell className="scrollable"><Tooltip title={log.Application}><span>{log.Application}</span></Tooltip></TableCell>
                                <TableCell className="scrollable" sx={{ maxWidth: '100px' }}>
                                    <Tooltip title={log.Status}>
                                        <span>
                                            <Chip label={log.Status} size="small" color={log.Status === 'Success' ? 'success' : 'error'} variant="outlined" />
                                        </span>
                                    </Tooltip>
                                </TableCell>
                                <TableCell sx={{ minWidth: '250px' }}>
                                    <MethodNameCell logId={log.Id} />
                                </TableCell>
                                <TableCell align="center">
                                    <Tooltip title={downloadingLogId === log.Id ? 'Opening in VS Code...' : 'Download and open in VS Code'}>
                                        <span>
                                            <IconButton size="small" onClick={() => onDownloadFullLog(log.Id)} disabled={downloadingLogId !== null} color="primary">
                                                {downloadingLogId === log.Id ? <CircularProgress size={18} thickness={5} color="primary" /> : <DownloadIcon fontSize="small" />}
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
    );
};
