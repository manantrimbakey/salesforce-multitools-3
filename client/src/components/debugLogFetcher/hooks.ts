import { useState, useCallback } from 'react';
import { callHost } from '../../vscode/messenger';
import type { Log, User } from './types';

export function useDebugLogs() {
    const [logs, setLogs] = useState<Log[]>([]);
    const [loading, setLoading] = useState(false);
    const [downloadingLogId, setDownloadingLogId] = useState<string | null>(null);

    const fetchLogs = useCallback(async (userFilter: string | null = null, size?: string, sizeDirection?: 'above' | 'below') => {
        setLoading(true);
        try {
            const response = await callHost('debugLogs:list', { userFilter, size, sizeDirection });
            setLogs(response?.records || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    const downloadFullLog = useCallback(async (logId: string) => {
        try {
            setDownloadingLogId(logId);
            await callHost('debugLogs:downloadOpen', { logId });
        } catch (e) {
            console.error(e);
        } finally {
            setDownloadingLogId(null);
        }
    }, []);

    const deleteLogs = useCallback(async (userName: string | null) => {
        return await callHost('debugLogs:bulkDelete', { userName });
    }, []);

    return { logs, loading, fetchLogs, downloadingLogId, downloadFullLog, deleteLogs };
}

export function useUsers() {
    const [users, setUsers] = useState<User[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [currentUser, setCurrentUser] = useState<{ display_name: string; username: string } | null>(null);

    const fetchUsers = useCallback(async (search: string = '') => {
        setLoadingUsers(true);
        try {
            const response = await callHost('debugLogs:users', { search });
            if (response) {
                setUsers(response.users || []);
                setCurrentUser(response.currentUser);
            }
            return response;
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingUsers(false);
        }
    }, []);

    return { users, loadingUsers, fetchUsers, currentUser };
}

export function useTraceFlags() {
    const [traceFlagOperations, setTraceFlagOperations] = useState<Set<string>>(new Set());

    const startLogging = useCallback(async (userId: string) => {
        setTraceFlagOperations((prev) => new Set(prev).add(userId));
        try {
            return await callHost('debugLogs:traceFlag:start', { userId });
        } finally {
            setTraceFlagOperations((prev) => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
        }
    }, []);

    const stopLogging = useCallback(async (userId: string, traceFlagId: string) => {
        setTraceFlagOperations((prev) => new Set(prev).add(userId));
        try {
            return await callHost('debugLogs:traceFlag:stop', { traceFlagId });
        } finally {
            setTraceFlagOperations((prev) => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
        }
    }, []);

    return { traceFlagOperations, startLogging, stopLogging };
}
