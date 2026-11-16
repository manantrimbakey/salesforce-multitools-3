/**
 * Pure helpers for extracting a human readable entry point from Apex debug log text.
 */

const LOG_EVENTS = new Set(['CODE_UNIT_STARTED', 'METHOD_ENTRY']);

export interface ExtractOptions {
    /**
     * The text is a truncated prefix of the log, so the final line (everything after the last
     * newline) may be cut off mid-way and must not be interpreted.
     */
    truncated?: boolean;
}

/**
 * Extract the first recognisable method / trigger / flow name from log content.
 * @returns the name, or `undefined` when none is found
 */
export function extractMethodName(logBody: string, options: ExtractOptions = {}): string | undefined {
    let text = logBody;
    if (options.truncated) {
        const lastNewline = text.lastIndexOf('\n');
        text = lastNewline === -1 ? '' : text.slice(0, lastNewline);
    }

    for (const line of text.split('\n')) {
        const parts = line.split('|');
        const event = parts[1];
        if (!LOG_EVENTS.has(event)) {
            continue;
        }

        const name = event === 'CODE_UNIT_STARTED' ? parseCodeUnitStarted(parts) : parseMethodEntry(parts);
        if (name) {
            return name;
        }
    }
    return undefined;
}

export function parseCodeUnitStarted(parts: string[]): string | null {
    // 00:30:32.0 (198512)|CODE_UNIT_STARTED|[EXTERNAL]|apex://Example_Controller/ACTION$getSessionId
    // 00:28:49.0 (210089)|CODE_UNIT_STARTED|[EXTERNAL]|01p000000000001|ExampleTrigger on ExampleProject trigger event BeforeUpdate|__sfdc_trigger/ExampleTrigger
    // 00:28:49.0 (194084)|CODE_UNIT_STARTED|[EXTERNAL]|TRIGGERS -- this should be ignored
    // 00:21:32.0 (247348)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Opportunity
    if (parts.length < 4) {
        return null;
    }

    const lastPart = parts[parts.length - 1].trim();

    if (lastPart === 'TRIGGERS') {
        return null;
    }

    if (lastPart.startsWith('apex://')) {
        const match = lastPart.match(/^apex:\/\/([^/]+)\/ACTION\$(.+)$/);
        if (match) {
            return `${match[1]}.${match[2]}`;
        }
    }

    if (lastPart.startsWith('Flow:')) {
        return lastPart;
    }

    // Trigger: the trigger description is the part before "__sfdc_trigger/<Name>"
    if (parts.length >= 6 && lastPart.includes('__sfdc_trigger/')) {
        return parts[parts.length - 2].trim();
    }

    return null;
}

export function parseMethodEntry(parts: string[]): string | null {
    // 00:22:12.0 (575653256)|METHOD_ENTRY|[20]|01p000000000001|ExampleUtility.invokeMethod(String, Map<String,ANY>)
    // 00:22:14.7 (2161081130)|METHOD_ENTRY|[76]||System.Pattern.compile(String) -- System methods are skipped
    if (parts.length < 5) {
        return null;
    }

    const methodPart = parts[parts.length - 1].trim();
    if (methodPart.startsWith('System.')) {
        return null;
    }

    const match = methodPart.match(/^([^.]+)\.([^(]+)/);
    return match ? `${match[1]}.${match[2]}` : null;
}
