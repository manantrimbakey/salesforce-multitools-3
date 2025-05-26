import * as vscode from 'vscode';

/**
 * Last modified information for a Salesforce component
 */
export interface LastModifiedInfo {
    lastModifiedBy: string;
    lastModifiedDate: string;
    lastModifiedById: string;
    retrievedAt: string;
    orgId?: string; // The Salesforce org ID
    orgUsername?: string; // The Salesforce org username
}

/**
 * Formatted last modified information for display
 */
export interface FormattedLastModifiedInfo {
    lastModifiedBy: string;
    lastModifiedDate: string; // ISO date string from Salesforce
    lastModifiedById: string;
    formattedDate: string; // Human-readable date in local format
    cachedAt?: number; // Optional timestamp for when this was cached
}

