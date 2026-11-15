#!/usr/bin/env node
// Opt-in end-to-end check of the trace flag / debug level flow against a REAL org.
//
//   pnpm run compile-tests   # builds out/
//   node scripts/dev/org-check.js <orgAlias> <sfdxProjectDir> --yes
//
// It runs the real DebugLogService, verifies every step with an independent `sf` query and cleans up.
// WRITES TO THE ORG: creates one TraceFlag on a user without an active flag and deletes it afterwards.
// Only use a developer / sandbox org you own. Never touches users that already have an active flag.
const { execFileSync } = require('child_process');
const path = require('path');

const [alias, projectDir] = process.argv.slice(2);
if (!alias || !projectDir || !process.argv.includes('--yes')) {
    console.error(
        'usage: node scripts/dev/org-check.js <orgAlias> <sfdxProjectDir> --yes   (creates and deletes a TraceFlag)',
    );
    process.exit(2);
}

// Make the extension code think `projectDir` is the open workspace (it resolves the default org from there).
require('./vscode-stub.js');
globalThis.__vscodeStub.workspace.workspaceFolders = [{ uri: { fsPath: path.resolve(projectDir) } }];

const { DebugLogService: Service } = require(path.resolve(__dirname, '../../out/services/debugLogService.js'));

const query = (soql, tooling) =>
    JSON.parse(
        execFileSync(
            'sf',
            ['data', 'query', ...(tooling ? ['--use-tooling-api'] : []), '-o', alias, '-q', soql, '--json'],
            {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            },
        ),
    ).result.records;

(async () => {
    let created;
    let failed = false;
    try {
        const levels = await Service.listDebugLevels();
        console.log('debug levels:', levels.map((l) => l.DeveloperName).join(', '));
        const level = levels[0];
        if (!level) throw new Error('org has no DebugLevel records to pick from');

        const { users } = await Service.searchUsers('');
        const target = users.find((u) => !u.TraceFlagActive);
        if (!target) throw new Error('every listed user already has an active trace flag');

        created = await Service.createTraceFlag(target.Id, level.Id);
        const [row] = query(
            `SELECT Id, TracedEntityId, LogType, ExpirationDate, DebugLevelId, DebugLevel.DeveloperName FROM TraceFlag WHERE Id='${created}'`,
            true,
        );
        const ok =
            row && row.TracedEntityId === target.Id && row.DebugLevelId === level.Id && row.LogType === 'USER_DEBUG';
        console.log(`trace flag ${created} in org:`, ok ? 'OK' : 'MISMATCH', JSON.stringify(row));
        failed = !ok;

        const seen = (await Service.searchUsers('')).users.find((u) => u.Id === target.Id);
        const reported = seen && seen.TraceFlagActive && seen.TraceFlagDebugLevel === level.DeveloperName;
        console.log('service reports active flag with level:', reported ? 'OK' : 'MISMATCH');
        failed ||= !reported;
    } catch (error) {
        failed = true;
        console.error('FAILED:', error.message ?? error);
    } finally {
        if (created) {
            await Service.deleteTraceFlag(created);
            console.log(
                'cleanup: remaining rows =',
                query(`SELECT Id FROM TraceFlag WHERE Id='${created}'`, true).length,
            );
        }
    }
    process.exit(failed ? 1 : 0);
})();
