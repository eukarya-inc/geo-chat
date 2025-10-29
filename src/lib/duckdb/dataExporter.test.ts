import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportDataAsJSON, shouldUseUrlMode, ObjectURLManager, LARGE_DATASET_THRESHOLD } from './dataExporter';
import type { DBContext } from './dbContext';

// Mock URL.createObjectURL and URL.revokeObjectURL for Node.js environment
let mockBlobUrl = 0;
const originalCreateObjectURL = global.URL.createObjectURL;
const originalRevokeObjectURL = global.URL.revokeObjectURL;

describe('dataExporter', () => {
    beforeEach(() => {
        // Mock URL.createObjectURL
        global.URL.createObjectURL = vi.fn(() => `blob:http://localhost/${++mockBlobUrl}`);
        // Mock URL.revokeObjectURL
        global.URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
        // Restore original functions
        global.URL.createObjectURL = originalCreateObjectURL;
        global.URL.revokeObjectURL = originalRevokeObjectURL;
        mockBlobUrl = 0;
    });
    describe('exportDataAsJSON', () => {
        it('should export data as JSON blob with Object URL', async () => {
            const mockRows = [
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' },
            ];

            const mockDbContext: DBContext = {
                executeQuery: vi.fn().mockResolvedValue(mockRows),
            } as unknown as DBContext;

            const result = await exportDataAsJSON(mockDbContext, {
                sql: 'SELECT * FROM test',
                schema: 'main',
            });

            expect(result.url).toContain('blob:');
            expect(result.rowCount).toBe(2);
            expect(result.sizeBytes).toBeGreaterThan(0);
            expect(typeof result.cleanup).toBe('function');

            // Cleanup
            result.cleanup();
        });

        it('should apply limit when specified', async () => {
            const mockDbContext: DBContext = {
                executeQuery: vi.fn().mockResolvedValue([]),
            } as unknown as DBContext;

            await exportDataAsJSON(mockDbContext, {
                sql: 'SELECT * FROM test',
                schema: 'main',
                limit: 100,
            });

            expect(mockDbContext.executeQuery).toHaveBeenCalledWith('SELECT * FROM test LIMIT 100', 'main');
        });
    });

    describe('shouldUseUrlMode', () => {
        it('should return true when row count exceeds threshold', async () => {
            const mockDbContext: DBContext = {
                executeQuery: vi.fn().mockResolvedValue([{ count: LARGE_DATASET_THRESHOLD + 1 }]),
            } as unknown as DBContext;

            const result = await shouldUseUrlMode(mockDbContext, 'SELECT * FROM test', 'main');

            expect(result).toBe(true);
        });

        it('should return false when row count is below threshold', async () => {
            const mockDbContext: DBContext = {
                executeQuery: vi.fn().mockResolvedValue([{ count: LARGE_DATASET_THRESHOLD - 1 }]),
            } as unknown as DBContext;

            const result = await shouldUseUrlMode(mockDbContext, 'SELECT * FROM test', 'main');

            expect(result).toBe(false);
        });

        it('should handle errors and return false', async () => {
            const mockDbContext: DBContext = {
                executeQuery: vi.fn().mockRejectedValue(new Error('Query failed')),
            } as unknown as DBContext;

            const result = await shouldUseUrlMode(mockDbContext, 'SELECT * FROM test', 'main');

            expect(result).toBe(false);
        });
    });

    describe('ObjectURLManager', () => {
        it('should register and track URLs', () => {
            const manager = new ObjectURLManager();
            const url1 = 'blob:http://localhost/test1';
            const url2 = 'blob:http://localhost/test2';

            manager.register(url1);
            manager.register(url2);

            expect(manager.size).toBe(2);
        });

        it('should revoke individual URLs', () => {
            const manager = new ObjectURLManager();
            const url = 'blob:http://localhost/test';

            manager.register(url);
            expect(manager.size).toBe(1);

            manager.revoke(url);
            expect(manager.size).toBe(0);
        });

        it('should revoke all URLs', () => {
            const manager = new ObjectURLManager();

            manager.register('blob:http://localhost/test1');
            manager.register('blob:http://localhost/test2');
            manager.register('blob:http://localhost/test3');

            expect(manager.size).toBe(3);

            manager.revokeAll();
            expect(manager.size).toBe(0);
        });
    });
});
