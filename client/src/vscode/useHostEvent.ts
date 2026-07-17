import { useEffect } from 'react';
import { messenger } from './messenger';
import type { WebviewEvent } from './messages';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useHostEvent(command: string, handler: (data: any, component?: string) => void) {
    useEffect(() => {
        const unsubscribe = messenger.onEvent((event: WebviewEvent) => {
            if (event.command === command) {
                handler(event.data, event.component);
            }
        });
        return unsubscribe;
    }, [command, handler]);
}
