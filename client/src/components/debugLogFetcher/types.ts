export type Log = {
    Id: string;
    LogUser: { Name: string };
    LogLength: number;
    StartTime: string;
    Operation: string;
    Application: string;
    Status: string;
    RequestIdentifier: string;
    methodName?: string;
};

export type User = {
    Id: string;
    Name: string;
    Username?: string;
    TraceFlagId?: string;
    TraceFlagActive?: boolean;
    TraceFlagExpirationDate?: string;
};
