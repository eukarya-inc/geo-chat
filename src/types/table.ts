export interface TableSpec {
    id: string;
    tableName: string;
    timestamp: Date;
    title?: string;
    columns?: string[]; // Optional: specific columns to show
}
