import { escapeSoqlString, escapeSoqlLike } from './soqlUtils';

export const SF_API_VERSION = 'v59.0';

export function buildApexLogQuery(userFilter?: string, size?: number, sizeDirection?: string): string {
    let query = 'SELECT Id, LogUser.Name, LogLength, Operation, Application, Status, StartTime, RequestIdentifier FROM ApexLog';
    
    const conditions: string[] = [];
    if (userFilter && userFilter !== 'all' && userFilter !== 'All Users') {
        conditions.push(`LogUser.Name = '${escapeSoqlString(userFilter)}'`);
    }
    
    // We could add LogLength to WHERE clause, but since Salesforce sometimes complains about complex SOQL,
    // we follow the original logic and filter in JS if needed, or we can just return the base query
    // and filter JS side as the old expressServer did.
    
    if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ' ORDER BY StartTime DESC LIMIT 200';
    return query;
}

export function buildUserSearchQuery(searchTerm?: string): string {
    let query = 'SELECT Id, Name, Username FROM User WHERE IsActive = true';
    if (searchTerm && searchTerm.length > 0) {
        const escapedSearchTerm = escapeSoqlLike(searchTerm);
        query += ` AND (Name LIKE '%${escapedSearchTerm}%' OR Username LIKE '%${escapedSearchTerm}%')`;
    }
    query += ' ORDER BY Name LIMIT 25';
    return query;
}

export function buildBulkDeleteApexLogQuery(userName?: string): string {
    let query = 'SELECT Id FROM ApexLog';
    if (userName && userName !== 'all') {
        query += ` WHERE LogUser.Name = '${escapeSoqlString(userName)}'`;
    }
    return query;
}
