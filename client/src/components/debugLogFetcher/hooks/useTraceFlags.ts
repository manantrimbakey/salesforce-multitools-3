import { useCallback, useState } from 'react';
import { api, errorMessage } from '../../../api/client';
import type { SfUser } from '../../../api/client';
import { hasRealUserId } from '../utils/user';
import type { Notify } from './useSnackbar';

const TRACE_FLAG_DURATION_MS = 60 * 60 * 1000;

interface Options {
    patchUser: (userId: string, patch: Partial<SfUser>) => void;
    reloadUsers: () => void;
    notify: Notify;
}

/** Start/stop trace flags and track which users have an operation in flight. */
export function useTraceFlags({ patchUser, reloadUsers, notify }: Options) {
    const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());

    const run = useCallback(
        async (userId: string, action: () => Promise<void>, failure: string) => {
            setPending((prev) => new Set(prev).add(userId));
            try {
                await action();
                reloadUsers(); // refresh trace flag status in the background
            } catch (e) {
                notify(`${failure}: ${errorMessage(e)}`, 'error');
            } finally {
                setPending((prev) => {
                    const next = new Set(prev);
                    next.delete(userId);
                    return next;
                });
            }
        },
        [notify, reloadUsers],
    );

    const start = useCallback(
        (user: SfUser) => {
            if (!hasRealUserId(user)) return Promise.resolve();
            return run(
                user.Id,
                async () => {
                    const response = await api.startTraceFlag(user.Id);
                    patchUser(user.Id, {
                        TraceFlagId: response.traceFlagId,
                        TraceFlagActive: true,
                        TraceFlagExpirationDate: new Date(Date.now() + TRACE_FLAG_DURATION_MS).toISOString(),
                    });
                    notify('Started logging for user. Trace flag created successfully.');
                },
                'Failed to start logging',
            );
        },
        [run, patchUser, notify],
    );

    const stop = useCallback(
        (user: SfUser) => {
            if (!hasRealUserId(user) || !user.TraceFlagId) return Promise.resolve();
            const traceFlagId = user.TraceFlagId;
            return run(
                user.Id,
                async () => {
                    await api.stopTraceFlag(user.Id, traceFlagId);
                    patchUser(user.Id, {
                        TraceFlagId: undefined,
                        TraceFlagActive: false,
                        TraceFlagExpirationDate: undefined,
                    });
                    notify('Stopped logging for user. Trace flag removed successfully.');
                },
                'Failed to stop logging',
            );
        },
        [run, patchUser, notify],
    );

    return { pending, start, stop };
}
