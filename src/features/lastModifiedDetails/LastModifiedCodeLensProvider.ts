import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { getMetadataInfoFromFilePath } from '../../utils/metadataUtils';
import { SFUtils } from '../../utils/sfutils';
import { FormattedLastModifiedInfo } from './lastModifiedTypes';

export class LastModifiedCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    private _pendingRefresh: Map<string, FormattedLastModifiedInfo> = new Map();

    public refreshWithLatestInfo(documentUri: vscode.Uri, info: FormattedLastModifiedInfo): void {
        const uriString = documentUri.toString();
        this._pendingRefresh.set(uriString, info);
        this._onDidChangeCodeLenses.fire();
    }

    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken,
    ): Promise<vscode.CodeLens[]> {
        if (document.uri.scheme !== 'file') {
            return [];
        }

        const filePath = document.uri.fsPath;
        if (!getMetadataInfoFromFilePath(filePath)) {
            return [];
        }

        try {
            const uriString = document.uri.toString();
            const pendingInfo = this._pendingRefresh.get(uriString);
            if (!pendingInfo) {
                return [];
            }

            const position = new vscode.Position(0, 0);
            const range = new vscode.Range(position, position);

            const connection = await SFUtils.getConnection();
            const orgUsername = connection?.getUsername?.() || (connection as any)?.username || '';

            return [
                new vscode.CodeLens(range, {
                    title: `$(history) Last modified: ${pendingInfo.formattedDate} by ${pendingInfo.lastModifiedBy}`,
                    tooltip: `Last modified on ${pendingInfo.formattedDate} by ${pendingInfo.lastModifiedBy}${
                        orgUsername ? ` in org ${orgUsername}` : ''
                    }\nClick to refresh`,
                    command: 'salesforce-multitools-3.refreshLastModifiedInfo',
                }),
            ];
        } catch (error) {
            Logger.error('Error providing CodeLens:', 'LastModifiedCodeLensProvider.provideCodeLenses', error);

            const position = new vscode.Position(0, 0);
            const range = new vscode.Range(position, position);
            return [
                new vscode.CodeLens(range, {
                    title: `$(error) Error retrieving last modified details`,
                    tooltip: 'Click to try again',
                    command: 'salesforce-multitools-3.refreshLastModifiedInfo',
                }),
            ];
        }
    }
}
