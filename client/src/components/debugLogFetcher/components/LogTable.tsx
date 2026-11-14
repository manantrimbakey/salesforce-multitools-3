import { useRef } from 'react';
import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ApexLog } from '../../../api/client';
import { LogRow, ROW_HEIGHT } from './LogRow';

const visuallyHidden = {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
} as const;

const COLUMNS = [
    { label: 'Logged By User', hint: 'User who created this debug log', width: '14%' },
    { label: 'Log Length', hint: 'Size of the debug log in bytes', width: 120 },
    { label: 'Start Time', hint: 'Date and time when the log was created', width: 170 },
    { label: 'Operation', hint: 'Operation that generated this log', width: '14%' },
    { label: 'Application', hint: 'Application that generated this log', width: '10%' },
    { label: 'Status', hint: 'Success or error status of the operation', width: 110 },
    { label: 'Method Name', hint: 'Primary method executed in this debug log', width: '24%' },
    { label: 'Actions', hint: undefined, width: 64 },
];

interface Props {
    logs: ApexLog[];
    loading: boolean;
    downloading: ReadonlySet<string>;
    onDownload: (logId: string) => void;
}

/** Virtualized log table: only rows near the viewport are in the DOM. */
export function LogTable({ logs, loading, downloading, onDownload }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const virtualizer = useVirtualizer({
        count: logs.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 8,
    });

    const items = virtualizer.getVirtualItems();
    const paddingTop = items.length > 0 ? items[0].start : 0;
    const paddingBottom = items.length > 0 ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;

    return (
        <TableContainer component={Paper} ref={scrollRef} sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <Table stickyHeader aria-label="debug logs table" size="small" sx={{ minWidth: 900, tableLayout: 'fixed' }}>
                <colgroup>
                    {COLUMNS.map((column) => (
                        <col key={column.label} style={{ width: column.width }} />
                    ))}
                </colgroup>
                <TableHead>
                    <TableRow>
                        {COLUMNS.map((column) => (
                            <TableCell
                                key={column.label}
                                title={column.hint}
                                align={column.hint ? 'left' : 'center'}
                                sx={{ whiteSpace: 'nowrap' }}
                            >
                                {column.hint ? column.label : <Box component="span" sx={visuallyHidden}>{column.label}</Box>}
                            </TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {logs.length === 0 && !loading ? (
                        <TableRow>
                            <TableCell colSpan={COLUMNS.length} align="center">
                                <Typography variant="body2" sx={{ py: 2 }}>
                                    No logs found. Click refresh to fetch logs.
                                </Typography>
                            </TableCell>
                        </TableRow>
                    ) : (
                        <>
                            {paddingTop > 0 && (
                                <TableRow aria-hidden style={{ height: paddingTop }}>
                                    <TableCell colSpan={COLUMNS.length} sx={{ p: 0, border: 0 }} />
                                </TableRow>
                            )}
                            {items.map((item) => {
                                const log = logs[item.index];
                                return (
                                    <LogRow
                                        key={log.Id}
                                        log={log}
                                        downloading={downloading.has(log.Id)}
                                        onDownload={onDownload}
                                    />
                                );
                            })}
                            {paddingBottom > 0 && (
                                <TableRow aria-hidden style={{ height: paddingBottom }}>
                                    <TableCell colSpan={COLUMNS.length} sx={{ p: 0, border: 0 }} />
                                </TableRow>
                            )}
                        </>
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );
}
