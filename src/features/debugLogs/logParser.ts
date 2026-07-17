import { Logger } from '../../utils/logger';

const LOG_EVENTS = ['CODE_UNIT_STARTED', 'METHOD_ENTRY'];

export function extractMethodNameFromLog(logBody: string): string {
    let methodName = 'NO_METHOD_NAME_FOUND';
    const logLines = logBody.split('\n');
    for (const line of logLines) {
        const parts = line.split('|');
        if (parts?.length && LOG_EVENTS.includes(parts[1])) {
            const extractedName =
                parts[1] === 'CODE_UNIT_STARTED'
                    ? processCodeUnitStartedLine(parts)
                    : processMethodEntryLine(parts);

            if (extractedName) {
                methodName = extractedName;
                break;
            }
        }
    }
    return methodName;
}

export function processCodeUnitStartedLine(parts: string[]): string | null {
    if (parts.length < 4) {
        return null;
    }

    if (parts[parts.length - 1].trim() === 'TRIGGERS') {
        return null;
    }

    const lastPart = parts[parts.length - 1].trim();

    if (lastPart.startsWith('apex://')) {
        const match = lastPart.match(/^apex:\/\/([^/]+)\/ACTION\$(.+)$/);
        if (match) {
            return `${match[1]}.${match[2]}`;
        }
    }

    if (lastPart.startsWith('Flow:')) {
        return lastPart;
    }

    if (parts.length >= 6 && lastPart.includes('__sfdc_trigger/')) {
        return parts[parts.length - 2].trim();
    }

    return null;
}

export function processMethodEntryLine(parts: string[]): string | null {
    if (parts.length < 5) {
        return null;
    }

    const methodPart = parts[parts.length - 1].trim();

    if (methodPart.startsWith('System.')) {
        return null;
    }

    const methodMatch = methodPart.match(/^([^.]+)\\.([^(]+)/);
    if (methodMatch) {
        return `${methodMatch[1]}.${methodMatch[2]}`;
    }

    return null;
}
