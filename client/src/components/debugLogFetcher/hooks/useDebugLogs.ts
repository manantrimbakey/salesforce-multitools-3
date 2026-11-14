import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../../../api/client';
import type { ApexLog, LogsQuery } from '../../../api/client';

/** Loads logs whenever the query changes. Stale (out-of-order) responses are discarded. */
export function useDebugLogs({ user, size, sizeDirection }: LogsQuery) {
    const [logs, setLogs] = useState<ApexLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestSeq = useRef(0);
    const invalidate = useCallback(() => {
        requestSeq.current++;
    }, []);

    const refresh = useCallback(async () => {
        const seq = ++requestSeq.current;
        setLoading(true);
        setError(null);
        try {
            const response = await api.getLogs({ user, size, sizeDirection });
            if (seq === requestSeq.current) setLogs(response.logs.records ?? []);
        } catch (e) {
            if (seq === requestSeq.current) setError(errorMessage(e));
        } finally {
            if (seq === requestSeq.current) setLoading(false);
        }
    }, [user, size, sizeDirection]);

    useEffect(() => {
        void refresh();
        return () => {
            invalidate(); // drop the in-flight request when the query changes or on unmount
        };
    }, [refresh, invalidate]);

    return { logs, loading, error, refresh };
}
