import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { isApiName, isInsideWorkspace, isSalesforceId, soqlEscape, soqlLikeEscape } from '../utils/validation';

suite('validation', () => {
    test('isSalesforceId accepts 15 and 18 character ids', () => {
        assert.ok(isSalesforceId('07L000000000001'));
        assert.ok(isSalesforceId('07L000000000001AAA'));
    });

    test('isSalesforceId rejects traversal, quotes and wrong lengths', () => {
        for (const value of [
            '',
            '../Account/001',
            "x' OR Id != '",
            '07L00000000000',
            '07L0000000000012',
            undefined,
            42,
        ]) {
            assert.strictEqual(isSalesforceId(value), false, String(value));
        }
    });

    test('isApiName accepts Salesforce API names only', () => {
        assert.ok(isApiName('My_Class2'));
        assert.strictEqual(isApiName("My'Class"), false);
        assert.strictEqual(isApiName('1Class'), false);
    });

    test('soqlEscape escapes backslashes before quotes', () => {
        assert.strictEqual(soqlEscape("O'Brien"), "O\\'Brien");
        // \' must not be able to terminate the string literal
        assert.strictEqual(soqlEscape("\\'"), "\\\\\\'");
    });

    test('soqlLikeEscape also escapes LIKE wildcards', () => {
        assert.strictEqual(soqlLikeEscape('50%_off'), '50\\%\\_off');
    });

    suite('isInsideWorkspace', () => {
        let root: string;
        let outside: string;

        suiteSetup(() => {
            root = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'));
            outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
            fs.mkdirSync(path.join(root, 'src'));
            fs.symlinkSync(outside, path.join(root, 'link'));
            (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [{ uri: { fsPath: root } }];
        });

        suiteTeardown(() => {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(outside, { recursive: true, force: true });
        });

        test('accepts the root, nested paths and not-yet-existing paths', async () => {
            assert.ok(await isInsideWorkspace(root));
            assert.ok(await isInsideWorkspace(path.join(root, 'src')));
            assert.ok(await isInsideWorkspace(path.join(root, 'src', 'new.txt')));
        });

        test('rejects traversal and sibling folders', async () => {
            assert.strictEqual(await isInsideWorkspace(path.join(root, '..')), false);
            assert.strictEqual(await isInsideWorkspace(`${root}-evil`), false);
        });

        test('rejects symlinks that point outside the workspace', async () => {
            assert.strictEqual(await isInsideWorkspace(path.join(root, 'link')), false);
        });
    });
});
