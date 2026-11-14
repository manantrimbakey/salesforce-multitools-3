import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/** 15 or 18 character Salesforce record Id */
const SALESFORCE_ID = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;
/** Salesforce API names (class, trigger, page, component, object ...) */
const API_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

export function isSalesforceId(value: unknown): value is string {
    return typeof value === 'string' && SALESFORCE_ID.test(value);
}

export function isApiName(value: unknown): value is string {
    return typeof value === 'string' && API_NAME.test(value);
}

/**
 * Escape a value for use inside a single-quoted SOQL string literal.
 * Backslashes must be escaped before quotes.
 */
export function soqlEscape(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Escape a value for a SOQL LIKE pattern (also escapes the % and _ wildcards). */
export function soqlLikeEscape(value: string): string {
    return soqlEscape(value).replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function isWithin(parent: string, child: string): boolean {
    const relative = path.relative(parent, child);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** Resolve symlinks; a path that does not exist yet falls back to its lexical form. */
async function realpathOrSelf(target: string): Promise<string> {
    try {
        return await fs.promises.realpath(target);
    } catch {
        return path.resolve(target);
    }
}

/**
 * True when the path is inside one of the open workspace folders. Symlinks are resolved on both
 * sides, so a link inside the workspace cannot be used to reach files outside it.
 */
export async function isInsideWorkspace(targetPath: string): Promise<boolean> {
    const resolved = await realpathOrSelf(targetPath);
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        if (isWithin(await realpathOrSelf(folder.uri.fsPath), resolved)) {
            return true;
        }
    }
    return false;
}

/**
 * Parse an optional non-negative integer query parameter.
 * @returns the number, or undefined when the value is absent / empty
 * @throws Error when the value is present but not a finite non-negative integer
 */
export function parseOptionalSize(value: string | undefined): number | undefined {
    if (value === undefined || value.trim() === '') {
        return undefined;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
        throw new Error('Invalid size');
    }
    return parsed;
}
