import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SFUtils } from '../../utils/sfutils';
import { Logger } from '../../utils/logger';

/**
 * Debug log provider for Salesforce logs
 */
export class DebugLogProvider {
    /**
     * Fetch debug logs from Salesforce
     */
    public static async fetchDebugLogs(): Promise<any[]> {
        try {
            Logger.debug('Fetching debug logs from Salesforce');
            const connection = await SFUtils.getConnection();
            
            // Query ApexLog records
            const result = await connection.query(
                'SELECT Id, LogUser.Name, LogLength, Operation, Application, Status, StartTime, RequestIdentifier FROM ApexLog ORDER BY StartTime DESC LIMIT 100'
            );
            
            // Format the logs for the UI
            const logs = result.records.map((log: any) => ({
                id: log.Id,
                logUser: log.LogUser?.Name || 'Unknown User',
                logLength: log.LogLength,
                operation: log.Operation,
                application: log.Application,
                status: log.Status,
                logDate: log.StartTime,
                requestId: log.RequestIdentifier
            }));
            
            Logger.debug(`Retrieved ${logs.length} debug logs`);
            return logs;
        } catch (error) {
            Logger.error('Error fetching debug logs:', error);
            throw error;
        }
    }
    
    /**
     * Get the content of a debug log by ID
     */
    public static async getDebugLogContent(logId: string): Promise<string> {
        try {
            const connection = await SFUtils.getConnection();
            
            // Get the log body using the REST API
            const logBody = await connection.request({
                url: `/services/data/v56.0/sobjects/ApexLog/${logId}/Body`,
                method: 'GET'
            });
            
            return logBody;
        } catch (error) {
            Logger.error(`Error fetching log content for ID ${logId}:`, error);
            throw error;
        }
    }
    
    /**
     * Delete a debug log
     */
    public static async deleteDebugLog(logId: string): Promise<void> {
        try {
            const connection = await SFUtils.getConnection();
            
            // Delete the log using the REST API
            await connection.request({
                url: `/services/data/v56.0/sobjects/ApexLog/${logId}`,
                method: 'DELETE'
            });
            
            Logger.debug(`Deleted debug log with ID: ${logId}`);
        } catch (error) {
            Logger.error(`Error deleting log with ID ${logId}:`, error);
            throw error;
        }
    }
    
    /**
     * Download a debug log to the user's workspace
     */
    public static async downloadDebugLog(logId: string): Promise<string> {
        try {
            // Get the log content
            const logContent = await this.getDebugLogContent(logId);
            
            // Create logs directory if it doesn't exist
            const logsDir = path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || '', 'logs');
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }
            
            // Create a file with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filePath = path.join(logsDir, `salesforce-log-${timestamp}.log`);
            
            // Write the log content to the file
            fs.writeFileSync(filePath, logContent);
            
            Logger.debug(`Downloaded debug log to: ${filePath}`);
            return filePath;
        } catch (error) {
            Logger.error(`Error downloading log with ID ${logId}:`, error);
            throw error;
        }
    }
    
    /**
     * View the log in a new editor tab
     */
    public static async viewDebugLog(logId: string): Promise<void> {
        try {
            // Get the log content
            const logContent = await this.getDebugLogContent(logId);
            
            // Create a virtual document and show it
            const untitledDoc = await vscode.workspace.openTextDocument({ 
                content: logContent,
                language: 'log'
            });
            
            // Show the document
            await vscode.window.showTextDocument(untitledDoc, {
                preview: false,
                viewColumn: vscode.ViewColumn.One
            });
            
            Logger.debug(`Opened debug log with ID: ${logId}`);
        } catch (error) {
            Logger.error(`Error viewing log with ID ${logId}:`, error);
            throw error;
        }
    }
} 