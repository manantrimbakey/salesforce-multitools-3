import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SFUtils } from '../../utils/sfutils';
import { Logger } from '../../utils/logger';
import { escapeSoqlString } from '../../utils/soqlUtils';
/**
 * Debug log provider for Salesforce logs
 */
export class DebugLogProvider {


    /**
     * Create a trace flag for a user to start debug logging
     */
    public static async createTraceFlag(userId: string): Promise<string> {
        try {
            const connection = await SFUtils.getConnection();

            // First, check if there's already an active trace flag for this user
            const existingTraceFlags = await connection.tooling.query(
                `SELECT Id, ExpirationDate FROM TraceFlag WHERE TracedEntityId = '${escapeSoqlString(userId)}' AND ExpirationDate > ${new Date().toISOString()}`,
            );

            if (existingTraceFlags.records && existingTraceFlags.records.length > 0) {
                throw new Error('User already has an active trace flag');
            }

            // Get or create a debug level
            const debugLevel = await this.getOrCreateDebugLevel();

            // Create trace flag with 1 hour expiration
            const expirationDate = new Date();
            expirationDate.setHours(expirationDate.getHours() + 1);

            const traceFlagData = {
                TracedEntityId: userId,
                LogType: 'USER_DEBUG',
                DebugLevelId: debugLevel.Id,
                StartDate: new Date().toISOString(),
                ExpirationDate: expirationDate.toISOString(),
            };

            const result = await connection.tooling.sobject('TraceFlag').create(traceFlagData);

            if (result.success) {
                Logger.debug(`Created trace flag with ID: ${result.id}`, 'DebugLogProvider.createTraceFlag');
                return result.id;
            } else {
                throw new Error(`Failed to create trace flag: ${result.errors?.join(', ')}`);
            }
        } catch (error) {
            Logger.error(`Error creating trace flag for user ${userId}:`, 'DebugLogProvider.createTraceFlag', error);
            throw error;
        }
    }

    /**
     * Delete a trace flag to stop debug logging for a user
     */
    public static async deleteTraceFlag(traceFlagId: string): Promise<void> {
        try {
            const connection = await SFUtils.getConnection();

            const result = await connection.tooling.sobject('TraceFlag').delete(traceFlagId);

            if (result.success) {
                Logger.debug(`Deleted trace flag with ID: ${traceFlagId}`, 'DebugLogProvider.deleteTraceFlag');
            } else {
                throw new Error(`Failed to delete trace flag: ${result.errors?.join(', ')}`);
            }
        } catch (error) {
            Logger.error(`Error deleting trace flag ${traceFlagId}:`, 'DebugLogProvider.deleteTraceFlag', error);
            throw error;
        }
    }

    /**
     * Get active trace flags for users
     */
    public static async getActiveTraceFlagsForUsers(userIds: string[]): Promise<Map<string, any>> {
        try {
            if (userIds.length === 0) {
                return new Map();
            }

            const connection = await SFUtils.getConnection();

            const userIdList = userIds.map((id) => `'${escapeSoqlString(id)}'`).join(', ');
            const now = new Date().toISOString();

            const traceFlags = await connection.tooling.query(
                `SELECT Id, TracedEntityId, ExpirationDate, DebugLevel.DeveloperName 
                 FROM TraceFlag 
                 WHERE TracedEntityId IN (${userIdList}) AND ExpirationDate > ${now}`,
            );

            const traceFlagMap = new Map();
            if (traceFlags.records) {
                traceFlags.records.forEach((tf: any) => {
                    traceFlagMap.set(tf.TracedEntityId, tf);
                });
            }

            Logger.debug(
                `Found ${traceFlagMap.size} active trace flags`,
                'DebugLogProvider.getActiveTraceFlagsForUsers',
            );
            return traceFlagMap;
        } catch (error) {
            Logger.error('Error getting active trace flags:', 'DebugLogProvider.getActiveTraceFlagsForUsers', error);
            return new Map();
        }
    }

    /**
     * Get or create a debug level for trace flags
     */
    private static async getOrCreateDebugLevel(): Promise<any> {
        try {
            const connection = await SFUtils.getConnection();

            // First try to find an existing debug level
            const existingDebugLevels = await connection.tooling.query(
                `SELECT Id, DeveloperName FROM DebugLevel WHERE DeveloperName = 'SF_Multitools_Debug' LIMIT 1`,
            );

            if (existingDebugLevels.records && existingDebugLevels.records.length > 0) {
                return existingDebugLevels.records[0];
            }

            // Create a new debug level with maximum logging for comprehensive debugging
            // ApexProfiling kept at INFO to avoid performance impact
            const debugLevelData = {
                DeveloperName: 'SF_Multitools_Debug',
                MasterLabel: 'Salesforce Multitools Debug Level',
                ApexCode: 'FINEST',
                ApexProfiling: 'NONE',
                Callout: 'FINEST',
                Database: 'FINEST',
                System: 'FINEST',
                Validation: 'FINEST',
                Visualforce: 'FINEST',
                Workflow: 'FINEST',
            };

            const result = await connection.tooling.sobject('DebugLevel').create(debugLevelData);

            if (result.success) {
                Logger.debug(`Created debug level with ID: ${result.id}`, 'DebugLogProvider.getOrCreateDebugLevel');
                return { Id: result.id, DeveloperName: 'SF_Multitools_Debug' };
            } else {
                throw new Error(`Failed to create debug level: ${result.errors?.join(', ')}`);
            }
        } catch (error) {
            Logger.error('Error getting or creating debug level:', 'DebugLogProvider.getOrCreateDebugLevel', error);
            throw error;
        }
    }
}

