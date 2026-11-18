import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { parsePermissionXml } from './xmlParser';
import type { PermissionItemOption, PermissionItemRef, PermissionItemType, PermissionModel } from './types';
import { WORKING_TREE_REF } from './types';

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 64 * 1024 * 1024;
const GIT_TIMEOUT_MS = 30_000;

const SUFFIX: Record<PermissionItemType, string> = {
    permissionset: '.permissionset-meta.xml',
    profile: '.profile-meta.xml',
};

/** Profile files use API names that differ from the display name Salesforce reports for standard profiles. */
export const STANDARD_PROFILE_NAMES: Record<string, string> = {
    Admin: 'System Administrator',
    Standard: 'Standard User',
    ReadOnly: 'Read Only',
    StandardAul: 'Standard Platform User',
    SolutionManager: 'Solution Manager',
    MarketingProfile: 'Marketing User',
    ContractManager: 'Contract Manager',
};

export class GitSourceError extends Error {}

async function git(cwd: string, args: string[]): Promise<string> {
    try {
        const { stdout } = await execFileAsync('git', args, {
            cwd,
            maxBuffer: MAX_BUFFER,
            timeout: GIT_TIMEOUT_MS,
            windowsHide: true,
        });
        return stdout;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new GitSourceError(`git ${args[0]} failed: ${message}`);
    }
}

/**
 * Root of the git repository containing `projectDir`, or undefined when the project is not under source control
 * (or git is not installed).
 */
export async function findRepositoryRoot(projectDir: string): Promise<string | undefined> {
    try {
        const root = (await git(projectDir, ['rev-parse', '--show-toplevel'])).trim();
        return root || undefined;
    } catch {
        return undefined;
    }
}

export interface GitRef {
    name: string;
    kind: 'branch' | 'remote' | 'tag';
}

/** Local branches, remote branches and tags (the allow-list every ref sent by the UI is checked against). */
export async function listRefs(repoRoot: string): Promise<GitRef[]> {
    const output = await git(repoRoot, [
        'for-each-ref',
        '--sort=-committerdate',
        '--format=%(refname)',
        'refs/heads',
        'refs/remotes',
        'refs/tags',
    ]);
    const refs: GitRef[] = [];
    for (const full of output.split('\n').filter(Boolean)) {
        if (full.startsWith('refs/heads/')) {
            refs.push({ name: full.slice('refs/heads/'.length), kind: 'branch' });
        } else if (full.startsWith('refs/remotes/')) {
            const name = full.slice('refs/remotes/'.length);
            if (!name.endsWith('/HEAD')) {
                refs.push({ name, kind: 'remote' });
            }
        } else if (full.startsWith('refs/tags/')) {
            refs.push({ name: full.slice('refs/tags/'.length), kind: 'tag' });
        }
    }
    return refs;
}

/** Package directories from `sfdx-project.json` (relative to the project), or undefined when unknown. */
async function readPackageDirectories(projectDir: string): Promise<string[] | undefined> {
    try {
        const json = JSON.parse(await fs.promises.readFile(path.join(projectDir, 'sfdx-project.json'), 'utf8')) as {
            packageDirectories?: Array<{ path?: unknown }>;
        };
        const paths = (json.packageDirectories ?? [])
            .map((dir) => dir.path)
            .filter((value): value is string => typeof value === 'string' && value.length > 0);
        return paths.length > 0 ? paths : undefined;
    } catch {
        return undefined;
    }
}

function toPosix(value: string): string {
    return value.split(path.sep).join('/');
}

function nameFromFile(filePath: string, type: PermissionItemType): string {
    const base = path.posix.basename(filePath, SUFFIX[type]);
    try {
        return decodeURIComponent(base);
    } catch {
        return base;
    }
}

function toOption(filePath: string, type: PermissionItemType): PermissionItemOption {
    const name = nameFromFile(filePath, type);
    const display = type === 'profile' ? (STANDARD_PROFILE_NAMES[name] ?? name) : name;
    return { id: filePath, name: display, label: display, type };
}

/** Repository-relative paths of the metadata files of a kind at `ref`, limited to the sfdx package directories. */
async function listFiles(
    repoRoot: string,
    projectDir: string,
    ref: string,
    type: PermissionItemType,
): Promise<string[]> {
    let files: string[];
    if (ref === WORKING_TREE_REF) {
        // tracked + untracked (not ignored) files, so freshly retrieved metadata shows up
        const output = await git(repoRoot, ['ls-files', '--cached', '--others', '--exclude-standard']);
        files = output.split('\n').filter(Boolean);
    } else {
        files = (await git(repoRoot, ['ls-tree', '-r', '--name-only', ref])).split('\n').filter(Boolean);
    }
    files = files.filter((file) => file.endsWith(SUFFIX[type]));

    const packageDirs = await readPackageDirectories(projectDir);
    if (packageDirs) {
        const prefixes = packageDirs.map((dir) => {
            const absolute = path.resolve(projectDir, dir);
            return `${toPosix(path.relative(repoRoot, absolute))}/`;
        });
        files = files.filter((file) => prefixes.some((prefix) => file.startsWith(prefix)));
    }
    return files.sort();
}

/**
 * Check a ref against the repository's own refs. Only refs that really exist reach `git show`, so a crafted
 * value (`--output=...`, `HEAD:../..`) can never be interpreted as an option or path.
 */
export async function assertKnownRef(repoRoot: string, ref: string): Promise<void> {
    if (ref === WORKING_TREE_REF) {
        return;
    }
    const known = await listRefs(repoRoot);
    if (!known.some((candidate) => candidate.name === ref)) {
        throw new GitSourceError(`Unknown branch or tag: ${ref}`);
    }
}

export async function listBranchItems(
    repoRoot: string,
    projectDir: string,
    ref: string,
    type: PermissionItemType,
): Promise<PermissionItemOption[]> {
    await assertKnownRef(repoRoot, ref);
    return (await listFiles(repoRoot, projectDir, ref, type)).map((file) => toOption(file, type));
}

/** Load one permission set / profile file from a ref (or the working tree) into the permission model. */
export async function loadBranchModel(
    repoRoot: string,
    projectDir: string,
    ref: string,
    item: PermissionItemRef,
): Promise<PermissionModel> {
    await assertKnownRef(repoRoot, ref);
    // The path must be one of the files we would list ourselves (no traversal, right kind, inside the package dirs)
    const allowed = await listFiles(repoRoot, projectDir, ref, item.type);
    if (!allowed.includes(item.id)) {
        throw new GitSourceError(`File not found at ${ref}: ${item.id}`);
    }

    const xml =
        ref === WORKING_TREE_REF
            ? await fs.promises.readFile(path.join(repoRoot, item.id), 'utf8')
            : await git(repoRoot, ['show', `${ref}:${item.id}`]);
    const option = toOption(item.id, item.type);
    return parsePermissionXml(xml, item.type, option.name);
}
