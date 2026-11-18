import type { Connection } from '@salesforce/core';
import * as vscode from 'vscode';
import { SFUtils } from '../../utils/sfutils';
import type { AuthorizedOrg } from '../../utils/sfutils';
import { diffPermissionModels } from './diff';
import { findRepositoryRoot, listBranchItems, listRefs, loadBranchModel } from './gitSource';
import type { GitRef } from './gitSource';
import { listOrgItems, loadOrgModel } from './orgLoader';
import type { QueryConnection } from './orgLoader';
import type {
    PermissionDiff,
    PermissionItemOption,
    PermissionItemRef,
    PermissionItemType,
    PermissionModel,
    PermissionSource,
} from './types';
import { WORKING_TREE_REF } from './types';

export interface CompareContext {
    orgs: AuthorizedOrg[];
    /** `available: false` when the project is not in a git repository: branch sources are then unavailable */
    git: { available: boolean; refs: GitRef[]; workingTreeRef: string };
}

export interface CompareSide {
    source: PermissionSource;
    item: PermissionItemRef;
}

export interface CompareResult {
    left: { name: string; type: PermissionItemType };
    right: { name: string; type: PermissionItemType };
    diff: PermissionDiff;
}

/** jsforce's generic `query<T extends Record>` is stricter than the loader's structural type; the shape matches. */
async function orgConnection(username: string): Promise<QueryConnection> {
    return (await SFUtils.getConnectionForUsername(username)) as Connection as unknown as QueryConnection;
}

function projectDir(): string {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!folder) {
        throw new Error('Open a Salesforce project folder first');
    }
    return folder;
}

async function repositoryRoot(): Promise<string> {
    const root = await findRepositoryRoot(projectDir());
    if (!root) {
        throw new Error('This project is not under git source control, so branches cannot be compared');
    }
    return root;
}

export class PermissionCompareService {
    /** Everything the UI needs to offer sources: authorized orgs and (when under git) the repository refs. */
    public static async getContext(): Promise<CompareContext> {
        const [orgs, git] = await Promise.all([
            SFUtils.listAuthorizedOrgs().catch(() => [] as AuthorizedOrg[]),
            (async () => {
                const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                const root = folder ? await findRepositoryRoot(folder) : undefined;
                return root
                    ? { available: true, refs: await listRefs(root), workingTreeRef: WORKING_TREE_REF }
                    : { available: false, refs: [] as GitRef[], workingTreeRef: WORKING_TREE_REF };
            })(),
        ]);
        return { orgs, git };
    }

    public static async listItems(source: PermissionSource, type: PermissionItemType): Promise<PermissionItemOption[]> {
        if (source.kind === 'org') {
            return listOrgItems(await orgConnection(source.username), type);
        }
        return listBranchItems(await repositoryRoot(), projectDir(), source.ref, type);
    }

    private static async load(side: CompareSide): Promise<PermissionModel> {
        if (side.source.kind === 'org') {
            return loadOrgModel(await orgConnection(side.source.username), side.item);
        }
        return loadBranchModel(await repositoryRoot(), projectDir(), side.source.ref, side.item);
    }

    public static async compare(left: CompareSide, right: CompareSide): Promise<CompareResult> {
        const [leftModel, rightModel] = await Promise.all([this.load(left), this.load(right)]);
        return {
            left: { name: leftModel.name, type: leftModel.type },
            right: { name: rightModel.name, type: rightModel.type },
            diff: diffPermissionModels(leftModel, rightModel),
        };
    }
}
