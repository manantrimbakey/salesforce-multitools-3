import { memo } from 'react';
import { Box, Chip, CircularProgress, IconButton, TableCell, TableRow } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import type { ApexLog } from '../../../api/client';
import { useMethodName } from '../hooks/useMethodName';
import { formatDate, formatLogLength } from '../utils/format';

export const ROW_HEIGHT = 37;

const cellSx = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

function MethodNameCell({ logId }: { logId: string }) {
    const { ref, state, retry } = useMethodName(logId);

    let content;
    let title: string | undefined;
    switch (state.status) {
        case 'loading':
            content = <CircularProgress size={16} aria-label="Loading method name" />;
            break;
        case 'queued':
            content = (
                <Box component="span" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                    Queued...
                </Box>
            );
            break;
        case 'error':
            title = `${state.message} (click to retry)`;
            content = (
                <Box
                    component="button"
                    type="button"
                    onClick={retry}
                    sx={{ all: 'unset', cursor: 'pointer', color: 'error.main', textDecoration: 'underline' }}
                >
                    Error
                </Box>
            );
            break;
        case 'done':
            title = state.methodName || 'No method found';
            content = state.methodName || 'N/A';
            break;
        default:
            content = null;
    }

    // The wrapper is always rendered so the shared IntersectionObserver has a stable target.
    return (
        <Box
            ref={ref}
            title={title}
            sx={{ display: 'block', minHeight: 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
            {content}
        </Box>
    );
}

interface Props {
    log: ApexLog;
    downloading: boolean;
    onDownload: (logId: string) => void;
}

function LogRowImpl({ log, downloading, onDownload }: Props) {
    const length = formatLogLength(log.LogLength);
    const start = formatDate(log.StartTime);
    const downloadLabel = downloading ? 'Opening in VS Code...' : 'Download and open in VS Code';

    return (
        <TableRow hover sx={{ height: ROW_HEIGHT }}>
            <TableCell sx={cellSx} title={log.LogUser.Name}>
                {log.LogUser.Name}
            </TableCell>
            <TableCell sx={cellSx} title={length}>
                {length}
            </TableCell>
            <TableCell sx={cellSx} title={start}>
                {start}
            </TableCell>
            <TableCell sx={cellSx} title={log.Operation}>
                {log.Operation}
            </TableCell>
            <TableCell sx={cellSx} title={log.Application}>
                {log.Application}
            </TableCell>
            <TableCell sx={cellSx} title={log.Status}>
                <Chip
                    label={log.Status}
                    size="small"
                    color={log.Status === 'Success' ? 'success' : 'error'}
                    variant="outlined"
                />
            </TableCell>
            <TableCell sx={cellSx}>
                <MethodNameCell logId={log.Id} />
            </TableCell>
            <TableCell align="center" sx={{ py: 0 }}>
                <IconButton
                    size="small"
                    color="primary"
                    title={downloadLabel}
                    aria-label={downloadLabel}
                    disabled={downloading}
                    onClick={() => onDownload(log.Id)}
                >
                    {downloading ? (
                        <CircularProgress size={18} thickness={5} color="primary" />
                    ) : (
                        <DownloadIcon fontSize="small" />
                    )}
                </IconButton>
            </TableCell>
        </TableRow>
    );
}

export const LogRow = memo(LogRowImpl);
