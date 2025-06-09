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

    private processLogLines(logLines: string[]): void {
        for (const line of logLines) {
            const parts = line.split('|');
            const methodName = parts[parts.length - 1];
            console.log(methodName);
        }
    }
}
