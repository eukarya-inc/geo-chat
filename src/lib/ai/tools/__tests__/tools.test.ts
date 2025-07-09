import { describe, it, expect, vi } from 'vitest';
import { ExecuteQueryTool } from '../executeQuery';
import { DescribeDataTool } from '../describeData';
import type { ToolContext } from '../base';

describe('AI Tools', () => {
  const mockContext: ToolContext = {
    duckdb: {
      executeQuery: vi.fn(),
      getTableNames: vi.fn(),
      getTableSchema: vi.fn(),
    },
    state: {
      datasets: [{
        id: '1',
        name: 'test_data',
        type: 'geojson',
        columns: [
          { name: 'id', type: 'INTEGER' },
          { name: 'name', type: 'VARCHAR' },
          { name: 'geom', type: 'GEOMETRY', isGeometry: true },
        ],
        rowCount: 100,
      }],
      activeDatasetId: '1',
    },
  };

  describe('ExecuteQueryTool', () => {
    it('should execute SQL queries', async () => {
      const tool = new ExecuteQueryTool();
      const mockResults = [{ count: 42 }];
      
      vi.mocked(mockContext.duckdb.executeQuery).mockResolvedValue(mockResults);
      
      const result = await tool.execute(
        { sql: 'SELECT COUNT(*) as count FROM test_data' },
        mockContext
      );
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResults);
      expect(result.message).toContain('1 rows');
      expect(mockContext.duckdb.executeQuery).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM test_data'
      );
    });

    it('should detect geometry columns', async () => {
      const tool = new ExecuteQueryTool();
      const mockResults = [{ id: 1, geom: 'POINT(0 0)' }];
      
      vi.mocked(mockContext.duckdb.executeQuery).mockResolvedValue(mockResults);
      
      const result = await tool.execute(
        { sql: 'SELECT * FROM test_data LIMIT 1' },
        mockContext
      );
      
      expect(result.visualization?.type).toBe('map');
    });
  });

  describe('DescribeDataTool', () => {
    it('should list all tables when no table name provided', async () => {
      const tool = new DescribeDataTool();
      
      vi.mocked(mockContext.duckdb.getTableNames).mockResolvedValue(['test_data', 'other_table']);
      vi.mocked(mockContext.duckdb.executeQuery)
        .mockResolvedValueOnce([{ column_count: 2, has_geometry: true }]) // test_data schema
        .mockResolvedValueOnce([{ count: 100 }]) // test_data count
        .mockResolvedValueOnce([{ column_count: 3, has_geometry: true }]) // other_table schema
        .mockResolvedValueOnce([{ count: 100 }]); // other_table count
      
      const result = await tool.execute({}, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Found 2 tables in the database');
      expect(result.message).toContain('2 with spatial data');
      expect(result.message).toContain('test_data: 100 rows, 2 columns (spatial data)');
      expect(result.message).toContain('other_table: 100 rows, 3 columns (spatial data)');
    });

    it('should describe specific table', async () => {
      const tool = new DescribeDataTool();
      
      vi.mocked(mockContext.duckdb.getTableSchema).mockResolvedValue([
        { column_name: 'id', column_type: 'INTEGER' },
        { column_name: 'name', column_type: 'VARCHAR' },
        { column_name: 'geom', column_type: 'GEOMETRY' },
      ]);
      vi.mocked(mockContext.duckdb.executeQuery).mockResolvedValue([{ count: 42 }]);
      
      const result = await tool.execute({ tableName: 'test_data' }, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('42 rows');
      expect(result.message).toContain('3 columns');
      expect(result.message).toContain('1 geometry column');
    });
  });
});
