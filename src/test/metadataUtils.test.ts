import * as assert from 'assert';
import { getMetadataInfoFromFilePath } from '../utils/metadataUtils';
import {
    getComponentFolder,
    getComponentName,
    getComponentType,
    ComponentType,
} from '../features/componentFileSwitcher/componentFileSwitcherUtils';

suite('metadataUtils', () => {
    test('recognizes single-file metadata by extension', () => {
        assert.deepStrictEqual(getMetadataInfoFromFilePath('/p/classes/MyClass.cls'), {
            type: 'ApexClass',
            apiName: 'MyClass',
        });
        assert.deepStrictEqual(getMetadataInfoFromFilePath('/p/triggers/T.trigger'), {
            type: 'ApexTrigger',
            apiName: 'T',
        });
        assert.deepStrictEqual(getMetadataInfoFromFilePath('/p/pages/P.page'), { type: 'ApexPage', apiName: 'P' });
    });

    test('uses the bundle folder name for LWC and Aura files', () => {
        assert.deepStrictEqual(getMetadataInfoFromFilePath('/p/lwc/myCmp/myCmp.js'), {
            type: 'LightningComponentBundle',
            apiName: 'myCmp',
        });
        assert.deepStrictEqual(getMetadataInfoFromFilePath('C:\\p\\aura\\MyAura\\MyAuraController.js'), {
            type: 'AuraDefinitionBundle',
            apiName: 'MyAura',
        });
    });

    test('maps custom objects to their DeveloperName and ignores standard objects', () => {
        assert.deepStrictEqual(getMetadataInfoFromFilePath('/p/objects/Invoice__c/Invoice__c.object-meta.xml'), {
            type: 'CustomObject',
            apiName: 'Invoice',
        });
        assert.deepStrictEqual(
            getMetadataInfoFromFilePath('/p/objects/ns__Invoice__c/ns__Invoice__c.object-meta.xml'),
            { type: 'CustomObject', apiName: 'Invoice' },
        );
        assert.strictEqual(getMetadataInfoFromFilePath('/p/objects/Account/Account.object-meta.xml'), null);
    });

    test('returns null for unrelated files', () => {
        assert.strictEqual(getMetadataInfoFromFilePath('/p/README.md'), null);
    });
});

suite('componentFileSwitcherUtils', () => {
    test('component folder is the bundle root even for files in subfolders', () => {
        assert.strictEqual(getComponentFolder('/p/lwc/foo/foo.js'), '/p/lwc/foo');
        assert.strictEqual(getComponentFolder('/p/lwc/foo/__tests__/foo.test.js'), '/p/lwc/foo');
        assert.strictEqual(getComponentFolder('C:\\p\\aura\\Bar\\sub\\x.js'), 'C:\\p\\aura\\Bar');
    });

    test('resolves name and type', () => {
        assert.strictEqual(getComponentName('/p/lwc/foo/foo.html'), 'foo');
        assert.strictEqual(getComponentType('/p/lwc/foo/foo.html'), ComponentType.LWC);
        assert.strictEqual(getComponentType('/p/aura/Bar/Bar.cmp'), ComponentType.AURA);
        assert.strictEqual(getComponentType('/p/classes/A.cls'), ComponentType.UNKNOWN);
        assert.strictEqual(getComponentFolder('/p/classes/A.cls'), null);
    });
});
