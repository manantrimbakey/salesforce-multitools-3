import { useEffect, useRef } from 'react';
import { isHostMessage } from '../messages';
import type { HostCommand, HostMessage } from '../messages';

type MessageOf<C extends HostCommand> = Extract<HostMessage, { command: C }>;

// Listen once at module level so messages that arrive before a (lazy-loaded) component mounts are not lost.
const latest = new Map<HostCommand, HostMessage>();
const listeners = new Set<(message: HostMessage) => void>();

window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!isHostMessage(event.data)) return;
    latest.set(event.data.command, event.data);
    listeners.forEach((listener) => listener(event.data as HostMessage));
});

/**
 * Subscribe to one kind of host message. With `replay`, the most recent matching message received
 * before subscribing is delivered on mount.
 */
export function useHostMessage<C extends HostCommand>(
    command: C,
    handler: (message: MessageOf<C>) => void,
    replay = false,
): void {
    const handlerRef = useRef(handler);
    useEffect(() => {
        handlerRef.current = handler;
    });

    useEffect(() => {
        const listener = (message: HostMessage) => {
            if (message.command === command) handlerRef.current(message as MessageOf<C>);
        };
        listeners.add(listener);
        const previous = latest.get(command);
        if (replay && previous) listener(previous);
        return () => {
            listeners.delete(listener);
        };
    }, [command, replay]);
}
