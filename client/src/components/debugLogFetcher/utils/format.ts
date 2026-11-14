export function formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return Number.isNaN(date.getTime()) ? dateString : date.toLocaleString();
}

export function formatLogLength(length: number): string {
    return `${length.toLocaleString()} bytes`;
}

/** Human readable time left until a trace flag expires, relative to `now` (ms epoch). */
export function formatExpirationTime(expirationDate: string, now: number = Date.now()): string {
    if (!expirationDate) return '';
    const expiresAt = new Date(expirationDate).getTime();
    if (Number.isNaN(expiresAt)) return 'Invalid date';

    const diffMs = expiresAt - now;
    if (diffMs <= 0) return 'Expired';

    const diffMinutes = Math.floor(diffMs / 60_000);
    const hours = Math.floor(diffMinutes / 60);
    return hours > 0 ? `Expires in ${hours}h ${diffMinutes % 60}m` : `Expires in ${diffMinutes}m`;
}
