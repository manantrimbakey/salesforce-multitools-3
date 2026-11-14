// One shared IntersectionObserver for all rows; callbacks are looked up by log id.
const callbacks = new Map<string, (visible: boolean) => void>();
let observer: IntersectionObserver | undefined;

function getObserver(): IntersectionObserver {
    observer ??= new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                const logId = (entry.target as HTMLElement).dataset.logId;
                if (logId) callbacks.get(logId)?.(entry.isIntersecting);
            }
        },
        { threshold: 0.1 },
    );
    return observer;
}

/** Watch `element` (which must stay mounted) and report visibility changes. Returns an unobserve function. */
export function observeVisibility(element: HTMLElement, logId: string, callback: (visible: boolean) => void) {
    element.dataset.logId = logId;
    callbacks.set(logId, callback);
    const shared = getObserver();
    shared.observe(element);
    return () => {
        shared.unobserve(element);
        if (callbacks.get(logId) === callback) callbacks.delete(logId);
    };
}
