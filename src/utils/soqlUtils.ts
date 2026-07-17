export function escapeSoqlString(v: string): string {
    return v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function escapeSoqlLike(v: string): string {
    return escapeSoqlString(v).replace(/%/g, '\\%').replace(/_/g, '\\_');
}
