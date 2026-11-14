import { useCallback, useState } from 'react';
import { api, errorMessage } from '../../../api/client';
import type { Notify } from './useSnackbar';

interface Options {
    notify: Notify;
    refreshLogs: () => void;
}

/** Download-and-open and bulk delete actions for logs. */
export function useLogActions({ notify, refreshLogs }: Options) {
    const [downloading, setDownloading] = useState<ReadonlySet<string>>(() => new Set());
    const [deleting, setDeleting] = useState(false);

    const download = useCallback(
        async (logId: string) => {
            setDownloading((prev) => new Set(prev).add(logId));
            try {
                await api.downloadLog(logId);
            } catch (e) {
                notify(`Failed to open log: ${errorMessage(e)}`, 'error');
            } finally {
                setDownloading((prev) => {
                    const next = new Set(prev);
                    next.delete(logId);
                    return next;
                });
            }
        },
        [notify],
    );

    /** `userName: null` deletes all logs. */
    const deleteLogs = useCallback(
        async (userName: string | null) => {
            setDeleting(true);
            try {
                const response = await api.deleteLogs(userName);
                const failed = response.failed ?? 0;
                notify(`Deleted ${response.deleted ?? 0} logs${failed > 0 ? `, failed: ${failed}` : ''}`);
                refreshLogs();
            } catch (e) {
                notify(`Failed to delete logs: ${errorMessage(e)}`, 'error');
            } finally {
                setDeleting(false);
            }
        },
        [notify, refreshLogs],
    );

    return { downloading, deleting, download, deleteLogs };
}
