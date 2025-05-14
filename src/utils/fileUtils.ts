import * as fs from 'fs';
import { Logger } from './logger';

/**
 * Ensure a folder exists, creating it if necessary
 * @param folderPath The path to the folder to ensure exists
 */
export async function ensureFolderExists(folderPath: string): Promise<void> {
    try {
        await fs.promises.access(folderPath);
    } catch (error) {
        // Folder doesn't exist, create it
        Logger.debug(`Creating folder: ${folderPath}`);
        await fs.promises.mkdir(folderPath, { recursive: true });
    }
}

/**
 * Write data to a JSON file (minified format)
 * @param filePath The path to the file
 * @param data The data to write
 */
export async function writeJsonFile(filePath: string, data: any): Promise<void> {
    try {
        await fs.promises.writeFile(filePath, JSON.stringify(data), 'utf-8');
        Logger.debug(`Wrote minified JSON data to: ${filePath}`);
    } catch (error) {
        Logger.error(`Error writing JSON file: ${filePath}`, error);
        throw error;
    }
}

/**
 * Read data from a JSON file
 * @param filePath The path to the file
 * @returns The parsed JSON data or null if the file doesn't exist
 */
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
    try {
        // Check if file exists
        try {
            await fs.promises.access(filePath);
        } catch (error) {
            return null; // File doesn't exist
        }

        // Read and parse the JSON file
        const data = await fs.promises.readFile(filePath, 'utf-8');
        return JSON.parse(data) as T;
    } catch (error) {
        Logger.error(`Error reading JSON file: ${filePath}`, error);
        return null;
    }
}
