import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '../../../api/client';
import type { CurrentUserInfo, SfUser } from '../../../api/client';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { CURRENT_USER_FALLBACK_ID } from '../utils/user';

/**
 * Users for the picker. Searches the server (debounced) for `searchTerm`; terms shorter than 2 chars
 * are ignored and an empty term loads the default list.
 */
export function useUsers(searchTerm: string) {
    const [users, setUsers] = useState<SfUser[]>([]);
    // Every user seen so far, so a selection survives later searches that no longer list it.
    const [knownUsers, setKnownUsers] = useState<Record<string, SfUser>>({});
    const [currentUserInfo, setCurrentUserInfo] = useState<CurrentUserInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestSeq = useRef(0);
    const invalidate = useCallback(() => {
        requestSeq.current++;
    }, []);
    const lastTerm = useRef('');

    const load = useCallback(async (term: string) => {
        const seq = ++requestSeq.current;
        lastTerm.current = term;
        setLoading(true);
        setError(null);
        try {
            const response = await api.getUsers(term);
            if (seq !== requestSeq.current) return;
            const list = response.users ?? [];
            setUsers(list);
            setKnownUsers((prev) => ({ ...prev, ...Object.fromEntries(list.map((u) => [u.Id, u])) }));
            if (response.currentUser) setCurrentUserInfo(response.currentUser);
        } catch (e) {
            if (seq === requestSeq.current) setError(errorMessage(e));
        } finally {
            if (seq === requestSeq.current) setLoading(false);
        }
    }, []);

    const debouncedTerm = useDebouncedValue(searchTerm);
    useEffect(() => {
        if (debouncedTerm.length === 1) return;
        void load(debouncedTerm);
        return () => {
            invalidate();
        };
    }, [debouncedTerm, load, invalidate]);

    /** Re-run the last search (e.g. after a trace flag changed). */
    const reload = useCallback(() => load(lastTerm.current), [load]);

    /** Optimistically update a user everywhere we hold it. */
    const patchUser = useCallback((userId: string, patch: Partial<SfUser>) => {
        setUsers((prev) => prev.map((u) => (u.Id === userId ? { ...u, ...patch } : u)));
        setKnownUsers((prev) => (prev[userId] ? { ...prev, [userId]: { ...prev[userId], ...patch } } : prev));
    }, []);

    const currentUser = useMemo<SfUser | null>(() => {
        if (!currentUserInfo) return null;
        const match = Object.values(knownUsers).find((u) => u.Username === currentUserInfo.username);
        return (
            match ?? {
                // Not in the org's user list: usable for filtering but not for trace flags.
                Id: CURRENT_USER_FALLBACK_ID,
                Name: currentUserInfo.display_name,
                Username: currentUserInfo.username,
                TraceFlagActive: false,
            }
        );
    }, [currentUserInfo, knownUsers]);

    return { users, knownUsers, currentUser, loading, error, reload, patchUser };
}
