// Mock data for testing table selection
export interface TableInfo {
    name: string;
    lastUpdated: Date;
}

export const MOCK_TABLES: TableInfo[] = [
    { name: 'customer', lastUpdated: new Date(Date.now() - 1000 * 60 * 30) }, // 30 minutes ago
    { name: 'orders', lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 2) }, // 2 hours ago
    { name: 'products', lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 5) }, // 5 hours ago
    { name: 'sales_2023', lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 24) }, // 1 day ago
    { name: 'sales_2024', lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2) }, // 2 days ago
    { name: 'employees', lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4) }, // 4 days ago
    { name: 'inventory', lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6) }, // 6 days ago
    { name: 'suppliers', lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10) }, // 10 days ago
    { name: 'regions', lastUpdated: new Date(Date.now() - 1000 * 60 * 5) }, // 5 minutes ago
];
