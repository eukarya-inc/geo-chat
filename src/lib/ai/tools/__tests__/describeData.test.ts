import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DescribeDataTool } from '../describeData';
import type { ToolContext } from '../base';

describe('DescribeDataTool', () => {
  const mockContext: ToolContext = {
    duckdb: {
      executeQuery: vi.fn(),
      getTableNames: vi.fn(),
      getTableSchema: vi.fn(),
    },
    state: {
      datasets: [
        {
          id: '1',
          name: 'Countries',
          type: 'geojson',
          columns: [
            { name: 'name', type: 'VARCHAR' },
            { name: 'population', type: 'INTEGER' },
            { name: 'geometry', type: 'GEOMETRY', isGeometry: true },
          ],
          rowCount: 195,
        },
      ],
      activeDatasetId: '1',
    },
  };

  const tool = new DescribeDataTool();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should describe a specific table', async () => {
    // Mock responses
    mockContext.duckdb.getTableSchema = vi.fn().mockResolvedValue([
      { column_name: 'name', column_type: 'VARCHAR', null: 'YES' },
      { column_name: 'population', column_type: 'INTEGER', null: 'NO' },
      { column_name: 'geometry', column_type: 'GEOMETRY', null: 'NO' },
    ]);
    mockContext.duckdb.executeQuery = vi.fn().mockResolvedValue([{ count: 195 }]);

    const result = await tool.execute({ tableName: 'countries' }, mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Table "countries" has 195 rows and 3 columns');
    expect(result.message).toContain('including 1 geometry column');
    expect(result.message).toContain('name (VARCHAR) [nullable]');
    expect(result.message).toContain('population (INTEGER)');
    expect(result.message).toContain('geometry (GEOMETRY)');
  });

  it('should list all tables efficiently', async () => {
    // Mock responses
    mockContext.duckdb.getTableNames = vi.fn().mockResolvedValue(['countries', 'cities']);
    mockContext.duckdb.executeQuery = vi.fn()
      .mockResolvedValueOnce([{ column_count: 3, has_geometry: true }]) // countries schema
      .mockResolvedValueOnce([{ count: 195 }]) // countries count
      .mockResolvedValueOnce([{ column_count: 5, has_geometry: false }]) // cities schema
      .mockResolvedValueOnce([{ count: 1000 }]); // cities count

    const result = await tool.execute({}, mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Found 2 tables in the database');
    expect(result.message).toContain('1 with spatial data');
    expect(result.message).toContain('countries: 195 rows, 3 columns (spatial data)');
    expect(result.message).toContain('cities: 1,000 rows, 5 columns');
    expect(result.message).toContain('Countries (geojson)');
    
    // Verify it only made 4 queries total (2 per table)
    expect(mockContext.duckdb.executeQuery).toHaveBeenCalledTimes(4);
  });

  it('should handle errors gracefully', async () => {
    mockContext.duckdb.getTableSchema = vi.fn().mockRejectedValue(new Error('Table not found'));

    const result = await tool.execute({ tableName: 'nonexistent' }, mockContext);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Table not found');
  });

  it('should handle tables with errors when listing all', async () => {
    mockContext.duckdb.getTableNames = vi.fn().mockResolvedValue(['good_table', 'bad_table']);
    mockContext.duckdb.executeQuery = vi.fn()
      .mockResolvedValueOnce([{ column_count: 2, has_geometry: false }]) // good_table schema
      .mockResolvedValueOnce([{ count: 100 }]) // good_table count
      .mockRejectedValueOnce(new Error('Permission denied')); // bad_table error

    const result = await tool.execute({}, mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Found 1 table'); // Only good_table
    expect(result.message).toContain('good_table: 100 rows, 2 columns');
    expect(result.message).not.toContain('bad_table');
  });
});