import * as assert from 'assert';
import { extractMethodName } from '../services/apexLogParser';

suite('apexLogParser', () => {
    test('extracts apex:// action code units', () => {
        const log = '00:30:32.0 (198512)|CODE_UNIT_STARTED|[EXTERNAL]|apex://Example_Controller/ACTION$getSessionId';
        assert.strictEqual(extractMethodName(log), 'Example_Controller.getSessionId');
    });

    test('extracts flows and triggers', () => {
        assert.strictEqual(
            extractMethodName('00:21:32.0 (247348)|CODE_UNIT_STARTED|[EXTERNAL]|Flow:Opportunity'),
            'Flow:Opportunity',
        );
        assert.strictEqual(
            extractMethodName(
                '00:28:22.1 (117180945)|CODE_UNIT_STARTED|[EXTERNAL]|01p000000000001|Opportunity on Opportunity trigger event BeforeUpdate|__sfdc_trigger/Opportunity',
            ),
            'Opportunity on Opportunity trigger event BeforeUpdate',
        );
    });

    test('ignores TRIGGERS and System methods, uses METHOD_ENTRY', () => {
        const log = [
            '00:28:49.0 (194084)|CODE_UNIT_STARTED|[EXTERNAL]|TRIGGERS',
            '00:22:14.7 (2161081130)|METHOD_ENTRY|[76]||System.Pattern.compile(String)',
            '00:22:12.0 (575653256)|METHOD_ENTRY|[20]|01p000000000001|ExampleUtility.invokeMethod(String, Map<String,ANY>)',
        ].join('\n');
        assert.strictEqual(extractMethodName(log), 'ExampleUtility.invokeMethod');
    });

    test('returns undefined when nothing matches', () => {
        assert.strictEqual(extractMethodName('64.0 APEX_CODE,FINEST\nsome other line'), undefined);
    });

    test('truncated input ignores the cut-off last line', () => {
        const cut = '00:22:12.0 (575653256)|METHOD_ENTRY|[20]|01p000000000001|ExampleUtility.invokeMe';
        assert.strictEqual(extractMethodName(cut, { truncated: true }), undefined);
        assert.strictEqual(extractMethodName(cut), 'ExampleUtility.invokeMe');
    });
});
