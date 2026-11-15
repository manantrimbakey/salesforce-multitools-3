import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { observeVisibility } from '../utils/visibilityObserver';
import { cancelQueuedMethodName, getMethodNameState, requestMethodName, subscribeMethodName } from './methodNameLoader';

/**
 * Lazily loads the method name for a log once its row is visible.
 * Attach `ref` to an element that is always rendered.
 */
export function useMethodName(logId: string) {
    const ref = useRef<HTMLElement | null>(null);

    const state = useSyncExternalStore(
        useCallback((listener) => subscribeMethodName(logId, listener), [logId]),
        () => getMethodNameState(logId),
    );

    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const unobserve = observeVisibility(node, logId, (visible) => {
            if (visible) requestMethodName(logId);
            else cancelQueuedMethodName(logId);
        });
        return () => {
            unobserve();
            cancelQueuedMethodName(logId);
        };
    }, [logId]);

    const retry = useCallback(() => requestMethodName(logId, true), [logId]);

    return { ref, state, retry };
}
