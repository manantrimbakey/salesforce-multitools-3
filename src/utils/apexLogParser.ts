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
const SYSTEM_METHOD_ENTRY = 'SYSTEM_METHOD_ENTRY';
const SYSTEM_METHOD_EXIT = 'SYSTEM_METHOD_EXIT';
const SYSTEM_MODE_ENTER = 'SYSTEM_MODE_ENTER';
const SYSTEM_MODE_EXIT = 'SYSTEM_MODE_EXIT';

const OPENERS = new Set([
    EXECUTION_STARTED,
    CODE_UNIT_STARTED,
    METHOD_ENTRY,
    CONSTRUCTOR_ENTRY,
    DML_BEGIN,
    SOQL_EXECUTE_BEGIN,
    SYSTEM_METHOD_ENTRY,
]);

const CLOSERS = new Set([
    CODE_UNIT_FINISHED,
    EXECUTION_FINISHED,
    METHOD_EXIT,
    SOQL_EXECUTE_END,
    CONSTRUCTOR_EXIT,
    DML_END,
    SYSTEM_METHOD_EXIT,
]);

const CLOSING_VS_OPENING = new Map<string, string>([
    [METHOD_EXIT, METHOD_ENTRY],
    [EXECUTION_FINISHED, EXECUTION_STARTED],
    [CODE_UNIT_FINISHED, CODE_UNIT_STARTED],
    [CONSTRUCTOR_EXIT, CONSTRUCTOR_ENTRY],
    [DML_END, DML_BEGIN],
    [SOQL_EXECUTE_END, SOQL_EXECUTE_BEGIN],
    [SYSTEM_METHOD_EXIT, SYSTEM_METHOD_ENTRY],
    [SYSTEM_MODE_EXIT, SYSTEM_MODE_ENTER],
]);

const OPENING_VS_CLOSING = new Map<string, string>([
    [METHOD_ENTRY, METHOD_EXIT],
    [EXECUTION_STARTED, EXECUTION_FINISHED],
    [CODE_UNIT_STARTED, CODE_UNIT_FINISHED],
    [CONSTRUCTOR_ENTRY, CONSTRUCTOR_EXIT],
    [DML_BEGIN, DML_END],
    [SOQL_EXECUTE_BEGIN, SOQL_EXECUTE_END],
    [SYSTEM_METHOD_ENTRY, SYSTEM_METHOD_EXIT],
    [SYSTEM_MODE_ENTER, SYSTEM_MODE_EXIT],
]);

interface ApexLogNode {
    event: string;
    details: string;
    children: ApexLogNode[] | null;
}

export class ApexLogParser {
    private readonly logFilePath: string;

    constructor(logFilePath: string) {
        this.logFilePath = logFilePath;
    }

    public async parseLog(): Promise<void> {
        const logLines = await this.readFileLines();
        this.processLogLines(logLines);
    }

    private async readFileLines(): Promise<string[]> {
        if (!(await fileExists(this.logFilePath))) {
            return [];
        }
        const logLines = await readFileContent(this.logFilePath);
        return splitIntoLines(logLines);
    }

    private processLogLines(logLines: string[]): ApexLogNode {
        const rootNodes: ApexLogNode[] = [];

        for (const line of logLines) {
            const parts = line.split('|') ?? [];

            if (!this.isLogEventExists(parts)) {
                continue;
            }

            const event = parts[1];

            if (this.isClosingEvent(parts)) {
                // Pop the last node from the stack
                const closedNode = this.pop();
                if (closedNode) {
                    const parent = this.peek();
                    if (parent) {
                        // Add as child to parent node
                        if (!parent.children) {
                            parent.children = [];
                        }
                        parent.children.push(closedNode);
                    } else {
                        // This is a root-level node
                        rootNodes.push(closedNode);
                    }
                }
            } else {
                // This is an opening event - create new node and push to stack
                const newNode: ApexLogNode = {
                    event: event,
                    details: parts.slice(2).join('|'), // Everything after the event type
                    children: null,
                };
                this.push(newNode);
            }
        }

        // Handle any remaining unclosed nodes in the stack
        while (!this.isEmpty()) {
            const remainingNode = this.pop();
            if (remainingNode) {
                rootNodes.push(remainingNode);
            }
        }

        // Store the result (you might want to add a class property to store this)
        // For now, we'll clear the stack to ensure clean state
        this.clear();

        return rootNodes;
    }

    private isLogEventExists(parts: string[]): boolean {
        let eventExists = false;

        const partsLength = parts.length;

        if (partsLength < 2) {
            return false;
        }

        return OPENERS.has(parts[1]) || CLOSERS.has(parts[1]);
    }

    private isClosingEvent(parts: string[]): boolean {
        return CLOSERS.has(parts[1]);
    }

    private stack: ApexLogNode[] = [];

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

    private clear(): void {
        this.stack = [];
    }
}

