import * as vscode from 'vscode';

/**
 * Last modified information for a Salesforce component
 */
export interface LastModifiedInfo {
    lastModifiedBy: string;
    lastModifiedDate: string;
    lastModifiedById: string;
    retrievedAt: string;
}

/**
 * Formatted last modified information for display
 */
export interface FormattedLastModifiedInfo {
    lastModifiedBy: string;
    lastModifiedDate: string;
    lastModifiedById: string;
    cachedAt?: number; // Optional timestamp for when this was cached
}
