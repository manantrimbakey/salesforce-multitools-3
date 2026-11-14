import { useSyncExternalStore } from 'react';

// One shared 60s interval drives every component that shows a relative time.
const TICK_MS = 60_000;
const subscribers = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let now = Date.now();

function subscribe(callback: () => void) {
    subscribers.add(callback);
    if (subscribers.size === 1) {
        now = Date.now();
        timer = setInterval(() => {
            now = Date.now();
            subscribers.forEach((subscriber) => subscriber());
        }, TICK_MS);
    }
    return () => {
        subscribers.delete(callback);
        if (subscribers.size === 0) clearInterval(timer);
    };
}

/** Current time in ms, refreshed once a minute. */
export function useMinuteTick(): number {
    return useSyncExternalStore(subscribe, () => now);
}
