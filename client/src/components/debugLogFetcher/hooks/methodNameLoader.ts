import { api, errorMessage } from '../../../api/client';

export type MethodNameState =
    | { status: 'idle' }
    | { status: 'queued' }
    | { status: 'loading' }
    | { status: 'done'; methodName: string; at: number }
    | { status: 'error'; message: string; at: number };

const IDLE: MethodNameState = { status: 'idle' };
const MAX_CONCURRENT = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const SUCCESS_TTL_MS = 30 * 60_000;
const ERROR_TTL_MS = 30_000; // failures (including timeouts) are never cached as a method name

// Module-level store shared by every row so results survive row unmounts (virtualized scrolling).
const states = new Map<string, MethodNameState>();
const listeners = new Map<string, Set<() => void>>();
const queue: string[] = [];
let active = 0;

function setState(logId: string, state: MethodNameState) {
    states.set(logId, state);
    listeners.get(logId)?.forEach((listener) => listener());
}

export function subscribeMethodName(logId: string, listener: () => void) {
    let set = listeners.get(logId);
    if (!set) listeners.set(logId, (set = new Set()));
    set.add(listener);
    return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(logId);
    };
}

export function getMethodNameState(logId: string): MethodNameState {
    return states.get(logId) ?? IDLE;
}

function isFresh(state: MethodNameState, now: number): boolean {
    if (state.status === 'done') return now - state.at < SUCCESS_TTL_MS;
    if (state.status === 'error') return now - state.at < ERROR_TTL_MS;
    return false;
}

function pump() {
    // The slot is reserved in the same synchronous step as the dequeue.
    while (active < MAX_CONCURRENT && queue.length > 0) {
        const logId = queue.shift()!;
        active++;
        void run(logId);
    }
}

async function run(logId: string) {
    let released = false;
    const release = () => {
        if (released) return; // idempotent: timeout and finally may both fire
        released = true;
        active--;
        pump();
    };

    setState(logId, { status: 'loading' });
    const timer = setTimeout(() => {
        setState(logId, { status: 'error', message: 'Request timed out', at: Date.now() });
        release();
    }, REQUEST_TIMEOUT_MS);

    try {
        const response = await api.getMethodName(logId);
        setState(logId, { status: 'done', methodName: response.methodName ?? '', at: Date.now() });
    } catch (e) {
        // A late failure must not overwrite an already-reported timeout.
        if (!released) setState(logId, { status: 'error', message: errorMessage(e), at: Date.now() });
    } finally {
        clearTimeout(timer);
        release();
    }
}

/** Queue a fetch unless a fresh result, or an in-flight/queued request, already exists. */
export function requestMethodName(logId: string, force = false) {
    const state = getMethodNameState(logId);
    if (state.status === 'loading' || state.status === 'queued') return;
    if (!force && isFresh(state, Date.now())) return;
    queue.push(logId);
    setState(logId, { status: 'queued' });
    pump();
}

/** Drop a not-yet-started request (row scrolled away / unmounted). */
export function cancelQueuedMethodName(logId: string) {
    const index = queue.indexOf(logId);
    if (index === -1) return;
    queue.splice(index, 1);
    setState(logId, IDLE);
}
