/**
 * Apex Log Parser
 *
 * This module is responsible for parsing Apex logs and extracting the relevant information.
 *
 */
// Example log syntax:
// 00:30:32.0 (198512)|CODE_UNIT_STARTED|[EXTERNAL]|apex://Example_Controller/ACTION$getSessionId
// 00:28:49.0 (210089)|CODE_UNIT_STARTED|[EXTERNAL]|01p000000000001|ExampleTrigger on ExampleProject trigger event BeforeUpdate|__sfdc_trigger/ExampleTrigger
// 00:30:22.117 (117180945)|CODE_UNIT_STARTED|[EXTERNAL]|01p000000000001|Opportunity on Opportunity trigger event BeforeUpdate|__sfdc_trigger/Opportunity
// 00:28:49.0 (194084)|CODE_UNIT_STARTED|[EXTERNAL]|TRIGGERS -- this should be ignored
// 00:21:32.0 (247348)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Opportunity

// 00:22:12.0 (575653256)|METHOD_ENTRY|[20]|01p000000000001|ExampleUtility.invokeMethod(String, Map<String,ANY>, Map<String,ANY>, Map<String,ANY>)
// 00:22:14.7 (2160790012)|METHOD_ENTRY|[23]|01p000000000001|ExampleValidation.validateConsentValues(List<ANY>)
// 00:22:14.7 (2161081130)|METHOD_ENTRY|[76]||System.Pattern.compile(String) --- dont match the System class methods
// 00:22:14.7 (2161235559)|METHOD_ENTRY|[78]||System.Matcher.matches() --- dont match the System class methods

import { fileExists, readFileContent, splitIntoLines } from './fileUtils';

const EXECUTION_STARTED = 'EXECUTION_STARTED';
const EXECUTION_FINISHED = 'EXECUTION_FINISHED';
const CODE_UNIT_STARTED = 'CODE_UNIT_STARTED';
const CODE_UNIT_FINISHED = 'CODE_UNIT_FINISHED';
const METHOD_ENTRY = 'METHOD_ENTRY';
const METHOD_EXIT = 'METHOD_EXIT';
const CONSTRUCTOR_ENTRY = 'CONSTRUCTOR_ENTRY';
const CONSTRUCTOR_EXIT = 'CONSTRUCTOR_EXIT';
const DML_BEGIN = 'DML_BEGIN';
const DML_END = 'DML_END';
const SOQL_EXECUTE_BEGIN = 'SOQL_EXECUTE_BEGIN';
const SOQL_EXECUTE_END = 'SOQL_EXECUTE_END';
const SYSTEM_MODE_ENTER = 'SYSTEM_MODE_ENTER';
const SYSTEM_MODE_EXIT = 'SYSTEM_MODE_EXIT';
const SYSTEM_METHOD_ENTRY = 'SYSTEM_METHOD_ENTRY';
const SYSTEM_METHOD_EXIT = 'SYSTEM_METHOD_EXIT';
// Exception and debug events
const FATAL_ERROR = 'FATAL_ERROR';
const EXCEPTION_THROWN = 'EXCEPTION_THROWN';
const USER_DEBUG = 'USER_DEBUG';

const OPENERS = new Set([
    EXECUTION_STARTED,
    CODE_UNIT_STARTED,
    METHOD_ENTRY,
    CONSTRUCTOR_ENTRY,
    DML_BEGIN,
    SOQL_EXECUTE_BEGIN,
    SYSTEM_MODE_ENTER,
    SYSTEM_METHOD_ENTRY,
]);

const CLOSERS = new Set([
    CODE_UNIT_FINISHED,
    EXECUTION_FINISHED,
    METHOD_EXIT,
    SOQL_EXECUTE_END,
    CONSTRUCTOR_EXIT,
    DML_END,
    SYSTEM_MODE_EXIT,
    SYSTEM_METHOD_EXIT,
]);

// Standalone events (don't have opening/closing pairs)
const STANDALONE_EVENTS = new Set([FATAL_ERROR, EXCEPTION_THROWN, USER_DEBUG]);

const CLOSING_VS_OPENING = new Map<string, string>([
    [METHOD_EXIT, METHOD_ENTRY],
    [EXECUTION_FINISHED, EXECUTION_STARTED],
    [CODE_UNIT_FINISHED, CODE_UNIT_STARTED],
    [CONSTRUCTOR_EXIT, CONSTRUCTOR_ENTRY],
    [DML_END, DML_BEGIN],
    [SOQL_EXECUTE_END, SOQL_EXECUTE_BEGIN],
    [SYSTEM_MODE_EXIT, SYSTEM_MODE_ENTER],
    [SYSTEM_METHOD_EXIT, SYSTEM_METHOD_ENTRY],
]);

interface ApexLogNode {
    event: string;
    lineNumber?: number;
    details: string;
    children: ApexLogNode[] | null;
    // Additional fields for exceptions and debugging
    exceptionType?: string;
    debugLevel?: string;
    severity?: 'ERROR' | 'FATAL' | 'WARNING' | 'INFO' | 'DEBUG';
}

export interface ApexLogParserOptions {
    ignoreSystemMethods?: boolean;
}

export class ApexLogParser {
    private readonly logFilePath: string;
    private readonly options: ApexLogParserOptions;
    private stack: ApexLogNode[] = [];

    constructor(logFilePath: string, options: ApexLogParserOptions = {}) {
        this.logFilePath = logFilePath;
        this.options = {
            ignoreSystemMethods: true, // Default to ignoring System methods
            ...options,
        };
    }

    public async parseLog(): Promise<ApexLogNode> {
        const logLines = await this.readFileLines();
        return this.processLogLines(logLines);
    }

    private async readFileLines(): Promise<string[]> {
        if (!(await fileExists(this.logFilePath))) {
            return [];
        }
        const logLines = await readFileContent(this.logFilePath);
        return splitIntoLines(logLines);
    }

    private processLogLines(logLines: string[]): ApexLogNode {
        // Create a single root container node
        const rootNode: ApexLogNode = {
            event: 'APEX_LOG_ROOT',
            lineNumber: undefined,
            details: 'Root container for all log entries',
            children: [],
        };

        this.stack = []; // Reset stack

        for (const line of logLines) {
            this.processLogLine(line, rootNode);
        }

        this.handleRemainingNodes(rootNode);
        return rootNode;
    }

    private processLogLine(line: string, rootNode: ApexLogNode): void {
        const parts = line.split('|') ?? [];

        if (!this.isLogEventExists(parts)) {
            return;
        }

        const event = parts[1];
        const rawDetails = parts.slice(2).join('|');
        const lineNumber = this.extractLineNumber(rawDetails);
        const cleanDetails = this.formatEventDetails(event, rawDetails);

        if (this.isClosingEvent(event)) {
            this.handleClosingEvent(event, rootNode);
        } else if (this.isOpeningEvent(event)) {
            this.handleOpeningEvent(event, lineNumber, cleanDetails);
        } else if (this.isStandaloneEvent(event)) {
            this.handleStandaloneEvent(event, lineNumber, rawDetails, rootNode);
        }
    }

    private extractLineNumber(rawDetails: string): number | undefined {
        // Extract line number from patterns like [20] or [67] or [EXTERNAL]
        const lineNumberMatch = rawDetails.match(/^\[(\d+)\]/);
        if (lineNumberMatch) {
            return parseInt(lineNumberMatch[1], 10);
        }
        return undefined;
    }

    private extractMeaningfulDetails(rawDetails: string): string {
        // Remove line number and class ID to get meaningful details
        // Pattern: [lineNumber]|classId|meaningfulDetails
        // or: [EXTERNAL]|classId|meaningfulDetails
        // or: [lineNumber]||meaningfulDetails (when no classId)

        const parts = rawDetails.split('|');

        if (parts.length >= 3) {
            // Skip [lineNumber] and classId, take the rest
            // Join remaining parts in case there are more pipes in the details
            return parts.slice(2).join('|');
        } else if (parts.length === 2) {
            // Pattern: [lineNumber]|meaningfulDetails
            return parts[1];
        }

        // If we can't parse properly, return the original
        return rawDetails;
    }

    private formatEventDetails(event: string, rawDetails: string): string {
        // Apply event-specific formatting for meaningful data extraction
        switch (event) {
            case CODE_UNIT_STARTED:
                return this.formatCodeUnitDetails(rawDetails);
            case METHOD_ENTRY:
                return this.formatMethodEntryDetails(rawDetails);
            case CONSTRUCTOR_ENTRY:
                return this.formatConstructorEntryDetails(rawDetails);
            case SOQL_EXECUTE_BEGIN:
                return this.formatSoqlDetails(rawDetails);
            case DML_BEGIN:
                return this.formatDmlDetails(rawDetails);
            case FATAL_ERROR:
                return this.formatFatalErrorDetails(rawDetails);
            case EXCEPTION_THROWN:
                return this.formatExceptionDetails(rawDetails);
            case USER_DEBUG:
                return this.formatUserDebugDetails(rawDetails);
            default:
                return this.extractMeaningfulDetails(rawDetails);
        }
    }

    private formatCodeUnitDetails(rawDetails: string): string {
        // Examples:
        // [EXTERNAL]|apex://Example_Controller/ACTION$getSessionId
        // [EXTERNAL]|01p000000000001|ExampleTrigger on ExampleProject trigger event BeforeUpdate|__sfdc_trigger/ExampleTrigger
        // [EXTERNAL]|Flow:Opportunity
        // [EXTERNAL]|TRIGGERS

        const parts = rawDetails.split('|');

        if (parts.length >= 2) {
            const mainContent = parts.slice(1).join('|');

            // Handle apex:// format
            if (mainContent.startsWith('apex://')) {
                const apexPath = mainContent.replace('apex://', '');
                return `Apex Controller: ${apexPath}`;
            }

            // Handle Flow format
            if (mainContent.startsWith('Flow:')) {
                return `Flow: ${mainContent.replace('Flow:', '')}`;
            }

            // Handle trigger format (has "trigger event" in it)
            if (mainContent.includes('trigger event')) {
                const triggerMatch = mainContent.match(/(\w+)\s+on\s+\w+\s+trigger\s+event\s+(\w+)/);
                if (triggerMatch) {
                    return `Trigger: ${triggerMatch[1]} (${triggerMatch[2]})`;
                }
            }

            // Handle simple cases like "TRIGGERS"
            if (parts.length === 2 && !mainContent.includes('|')) {
                return mainContent;
            }

            // For complex cases with class IDs, extract the meaningful part
            if (parts.length >= 3) {
                return parts.slice(2).join('|');
            }

            return mainContent;
        }

        return rawDetails;
    }

    private formatMethodEntryDetails(rawDetails: string): string {
        // Examples:
        // [20]|01p000000000001|ExampleUtility.invokeMethod(String, Map<String,ANY>, Map<String,ANY>, Map<String,ANY>)
        // [23]|01p000000000001|ExampleValidation.validateConsentValues(List<ANY>)
        // [76]||System.Pattern.compile(String)

        const parts = rawDetails.split('|');

        if (parts.length >= 3) {
            const methodSignature = parts.slice(2).join('|');
            return methodSignature;
        } else if (parts.length === 2) {
            return parts[1];
        }

        return rawDetails;
    }

    private formatConstructorEntryDetails(rawDetails: string): string {
        // Examples:
        // [15]|01p000000000001|<init>()|Example_Wrapper
        // [24]|01p000000000001|<init>(String,String,String)|Example_QueryBuilder
        // [EXTERNAL]|01p000000000001|<init>()|Example_AccessBase

        const parts = rawDetails.split('|');

        if (parts.length >= 3) {
            const constructorDetails = parts.slice(2).join('|');

            // Parse constructor format: <init>(params)|ClassName
            const constructorMatch = constructorDetails.match(/<init>\(([^)]*)\)\|(.+)/);
            if (constructorMatch) {
                const params = constructorMatch[1];
                const className = constructorMatch[2];

                if (params) {
                    return `${className} Constructor(${params})`;
                } else {
                    return `${className} Constructor()`;
                }
            }

            return constructorDetails;
        }

        return rawDetails;
    }

    private formatSoqlDetails(rawDetails: string): string {
        // Examples:
        // [115]|Aggregations:0|SELECT Id,Account_Owner__c,OwnerId FROM Account WHERE id = :accountId

        const parts = rawDetails.split('|');

        if (parts.length >= 3) {
            // Skip line number and aggregation info, get the SQL
            const sqlQuery = parts.slice(2).join('|');
            return `SOQL: ${sqlQuery}`;
        }

        return this.extractMeaningfulDetails(rawDetails);
    }

    private formatDmlDetails(rawDetails: string): string {
        // Handle DML operations
        const basicDetails = this.extractMeaningfulDetails(rawDetails);
        return `DML: ${basicDetails}`;
    }

    private formatFatalErrorDetails(rawDetails: string): string {
        // FATAL_ERROR format: System.NullPointerException: Attempt to de-reference a null object
        // No line number prefix for FATAL_ERROR events
        return `Fatal Error: ${rawDetails}`;
    }

    private formatExceptionDetails(rawDetails: string): string {
        // Handle EXCEPTION_THROWN events
        const basicDetails = this.extractMeaningfulDetails(rawDetails);
        return `Exception: ${basicDetails}`;
    }

    private formatUserDebugDetails(rawDetails: string): string {
        // USER_DEBUG format: [lineNumber]|debugLevel|message
        // Example: [131]|INFO|Nebula Logger - Version Number: v4.15.8
        const parts = rawDetails.split('|');

        if (parts.length >= 3) {
            const debugLevel = parts[1];
            const message = parts.slice(2).join('|');
            return `Debug [${debugLevel}]: ${message}`;
        } else if (parts.length === 2) {
            return `Debug: ${parts[1]}`;
        }

        return `Debug: ${rawDetails}`;
    }

    private handleClosingEvent(event: string, rootNode: ApexLogNode): void {
        const closedNode = this.closeMatchingNode(event);
        if (!closedNode) {
            return;
        }

        // Handle System method filtering based on configuration
        const shouldIgnoreSystemMethods =
            this.options.ignoreSystemMethods &&
            // Filter SYSTEM_METHOD_ENTRY/EXIT events
            (closedNode.event === SYSTEM_METHOD_ENTRY ||
                // Filter System class method calls (METHOD_ENTRY with System. in details)
                (closedNode.event === METHOD_ENTRY && this.isSystemClassMethod(closedNode.details)));

        if (shouldIgnoreSystemMethods) {
            // Add the children of the System method to the parent instead of the method itself
            if (closedNode.children && closedNode.children.length > 0) {
                const parent = this.peek();
                const targetParent = parent || rootNode;

                // Add each child of the System method to the parent
                closedNode.children.forEach((child) => {
                    this.addChildToParent(targetParent, child);
                });
            }
            return;
        }

        const parent = this.peek();
        if (parent) {
            this.addChildToParent(parent, closedNode);
        } else {
            // Add to root node instead of separate root nodes array
            this.addChildToParent(rootNode, closedNode);
        }
    }

    private handleOpeningEvent(event: string, lineNumber: number | undefined, details: string): void {
        // Always create and push the node to maintain stack consistency
        // We'll filter it out later when closing
        const newNode: ApexLogNode = {
            event: event,
            lineNumber: lineNumber,
            details: details,
            children: null,
        };
        this.push(newNode);
    }

    private handleStandaloneEvent(
        event: string,
        lineNumber: number | undefined,
        rawDetails: string,
        rootNode: ApexLogNode,
    ): void {
        const cleanDetails = this.formatEventDetails(event, rawDetails);

        const standaloneNode: ApexLogNode = {
            event: event,
            lineNumber: lineNumber,
            details: cleanDetails,
            children: null,
        };

        // Add additional metadata for exceptions and debug events
        if (event === FATAL_ERROR) {
            standaloneNode.severity = 'FATAL';
            standaloneNode.exceptionType = this.extractExceptionType(rawDetails);
        } else if (event === EXCEPTION_THROWN) {
            standaloneNode.severity = 'ERROR';
            standaloneNode.exceptionType = this.extractExceptionType(rawDetails);
        } else if (event === USER_DEBUG) {
            const debugLevel = this.extractDebugLevel(rawDetails);
            standaloneNode.debugLevel = debugLevel;
            standaloneNode.severity = this.mapDebugLevelToSeverity(debugLevel);
        }

        // Add to the current context or root
        const parent = this.peek();
        if (parent) {
            this.addChildToParent(parent, standaloneNode);
        } else {
            this.addChildToParent(rootNode, standaloneNode);
        }
    }

    private extractExceptionType(rawDetails: string): string {
        // Extract exception type from messages like "System.NullPointerException: Attempt to de-reference a null object"
        const exceptionMatch = rawDetails.match(/^(System\.\w+Exception|\w+Exception)/);
        return exceptionMatch ? exceptionMatch[1] : 'Unknown';
    }

    private extractDebugLevel(rawDetails: string): string {
        // Extract debug level from USER_DEBUG format: [lineNumber]|debugLevel|message
        const parts = rawDetails.split('|');
        if (parts.length >= 2) {
            return parts[1];
        }
        return 'DEBUG';
    }

    private mapDebugLevelToSeverity(debugLevel: string): 'ERROR' | 'FATAL' | 'WARNING' | 'INFO' | 'DEBUG' {
        switch (debugLevel?.toUpperCase()) {
            case 'ERROR':
                return 'ERROR';
            case 'WARN':
            case 'WARNING':
                return 'WARNING';
            case 'INFO':
                return 'INFO';
            case 'DEBUG':
            default:
                return 'DEBUG';
        }
    }

    private addChildToParent(parent: ApexLogNode, child: ApexLogNode): void {
        // Skip adding System methods as children only if ignoreSystemMethods is enabled
        const shouldIgnoreSystemMethods =
            this.options.ignoreSystemMethods &&
            // Filter SYSTEM_METHOD_ENTRY events
            (child.event === SYSTEM_METHOD_ENTRY ||
                // Filter System class method calls (METHOD_ENTRY with System. in details)
                (child.event === METHOD_ENTRY && this.isSystemClassMethod(child.details)));

        if (shouldIgnoreSystemMethods) {
            return;
        }

        if (!parent.children) {
            parent.children = [];
        }
        parent.children.push(child);
    }

    private handleRemainingNodes(rootNode: ApexLogNode): void {
        while (!this.isEmpty()) {
            const remainingNode = this.pop();
            if (remainingNode) {
                // Skip System methods in remaining nodes only if ignoreSystemMethods is enabled
                const shouldIgnoreSystemMethods =
                    this.options.ignoreSystemMethods &&
                    // Filter SYSTEM_METHOD_ENTRY events
                    (remainingNode.event === SYSTEM_METHOD_ENTRY ||
                        // Filter System class method calls (METHOD_ENTRY with System. in details)
                        (remainingNode.event === METHOD_ENTRY && this.isSystemClassMethod(remainingNode.details)));

                if (shouldIgnoreSystemMethods) {
                    continue;
                }
                this.addChildToParent(rootNode, remainingNode);
            }
        }
    }

    private isLogEventExists(parts: string[]): boolean {
        if (parts.length < 2) {
            return false;
        }
        return this.isOpeningEvent(parts[1]) || this.isClosingEvent(parts[1]) || this.isStandaloneEvent(parts[1]);
    }

    private isOpeningEvent(event: string): boolean {
        return OPENERS.has(event);
    }

    private isClosingEvent(event: string): boolean {
        return CLOSERS.has(event);
    }

    private isStandaloneEvent(event: string): boolean {
        return STANDALONE_EVENTS.has(event);
    }

    private closeMatchingNode(closingEvent: string): ApexLogNode | null {
        const expectedOpeningEvent = CLOSING_VS_OPENING.get(closingEvent);
        if (!expectedOpeningEvent) {
            return null;
        }

        for (let i = this.stack.length - 1; i >= 0; i--) {
            if (this.stack[i].event === expectedOpeningEvent) {
                const node = this.stack.splice(i, 1)[0];
                return node;
            }
        }

        return null;
    }

    private push(node: ApexLogNode): void {
        this.stack.push(node);
    }

    private pop(): ApexLogNode | undefined {
        return this.stack.pop();
    }

    private peek(): ApexLogNode | undefined {
        return this.stack[this.stack.length - 1];
    }

    private isEmpty(): boolean {
        return this.stack.length === 0;
    }

    private isSystemClassMethod(details: string): boolean {
        // Check if this is a System class method call
        // Examples: "System.JSON.serialize", "System.UserInfo.getUserId", etc.
        return details.includes('System.');
    }
}

