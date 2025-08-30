import type { DBContext } from '../lib/duckdb/dbContext';
import { analyzeTableGeometry, formatGeometryInfo } from '../lib/ai/tools/geometryDetector';
import type { GeometryInfo } from '../lib/ai/tools/geometryDetector';

export interface TableInfo {
  tableName: string;
  tableSchema?: Array<{ name: string; type: string }>;
  hasGeometry?: boolean;
  geometryInfo?: GeometryInfo[];
  sampleData?: Record<string, unknown>[];
  rowCount?: number;
  columnCount?: number;
  suggestions?: string[];
}

/**
 * Get comprehensive information about a table for AI context
 */
export async function getTableInfo(
  dbContext: DBContext,
  tableName: string,
  schema: string | null
): Promise<TableInfo> {
  const info: TableInfo = {
    tableName
  };

  try {
    // Get table schema
    const schemaQuery = schema
      ? `DESCRIBE ${schema}.${tableName}`
      : `DESCRIBE ${tableName}`;
    const schemaResult = await dbContext.executeQuery(schemaQuery, schema);
    const schemaData = schemaResult as Array<{ column_name: string; column_type: string }>;

    info.tableSchema = schemaData.map(row => ({
      name: row.column_name,
      type: row.column_type
    }));
    info.columnCount = schemaData.length;

    // Analyze geometry columns
    const geometryAnalysis = await analyzeTableGeometry(dbContext, tableName, schema);
    info.hasGeometry = geometryAnalysis.hasGeometry;
    info.geometryInfo = geometryAnalysis.geometryInfo;

    // Get sample data (first 5 rows)
    const sampleQuery = schema
      ? `SELECT * FROM ${schema}.${tableName} LIMIT 5`
      : `SELECT * FROM ${tableName} LIMIT 5`;
    const sampleResult = await dbContext.executeQuery(sampleQuery, schema);
    info.sampleData = sampleResult as Record<string, unknown>[];

    // Get row count
    const countQuery = schema
      ? `SELECT COUNT(*) as count FROM ${schema}.${tableName}`
      : `SELECT COUNT(*) as count FROM ${tableName}`;
    const countResult = await dbContext.executeQuery(countQuery, schema);
    const countData = countResult as Array<{ count: number }>;
    if (countData.length > 0) {
      info.rowCount = countData[0].count;
    }

    // Add suggestions based on geometry presence
    info.suggestions = [];
    
    if (info.hasGeometry && info.geometryInfo) {
      const geometryInfoStr = formatGeometryInfo(info.geometryInfo);
      info.suggestions.push(
        `テーブル「${tableName}」が作成されました。`,
        `ジオメトリカラムが検出されました: ${geometryInfoStr}`,
        `このテーブルは地図での可視化が可能です。地図スタイルを設定するには update_map_style_for_table ツールを使用してください。`
      );
    } else {
      info.suggestions.push(
        `テーブル「${tableName}」が作成されました。ジオメトリフィールドがないため、地図での可視化はできません。`,
        `グラフでの可視化は update_vega_chart_spec_for_table ツールを使用してください。`
      );
    }

    // Add chart suggestion for all tables
    info.suggestions.push(
      `このテーブルのVega-Liteチャート設定はまだ作成されていません。グラフを作成するには update_vega_chart_spec_for_table ツールを使用してください。`
    );

    // Add data analysis suggestions based on row count
    if (info.rowCount) {
      if (info.rowCount > 100) {
        info.suggestions.push(
          'データが多いです。特定の条件でフィルタしてみませんか？',
          'COUNT(), AVG(), SUM()などの集計関数を使ってデータを要約できます',
          'GROUP BYを使ってカテゴリ別の集計ができます'
        );
      } else if (info.rowCount > 20) {
        info.suggestions.push(
          'ORDER BYでデータを並び替えられます',
          '集計関数でデータの概要を把握できます'
        );
      }
    }

  } catch (error) {
    console.error('Failed to get table info:', error);
    // Return minimal info if there's an error
    info.suggestions = [`テーブル「${tableName}」が作成されました。`];
  }

  return info;
}

/**
 * Format table info for AI context (not for UI rendering)
 */
export function formatTableInfoForAI(info: TableInfo): string {
  const parts: string[] = [];
  
  parts.push(`Table: ${info.tableName}`);
  
  if (info.rowCount !== undefined && info.columnCount !== undefined) {
    parts.push(`Size: ${info.rowCount} rows × ${info.columnCount} columns`);
  }
  
  if (info.tableSchema) {
    parts.push('Schema:');
    info.tableSchema.forEach(col => {
      parts.push(`  - ${col.name}: ${col.type}`);
    });
  }
  
  if (info.hasGeometry && info.geometryInfo) {
    parts.push(`Geometry: ${formatGeometryInfo(info.geometryInfo)}`);
  }
  
  if (info.sampleData && info.sampleData.length > 0) {
    parts.push('Sample data (first 5 rows):');
    parts.push(JSON.stringify(info.sampleData, null, 2));
  }
  
  if (info.suggestions && info.suggestions.length > 0) {
    parts.push('Suggestions:');
    info.suggestions.forEach(s => parts.push(`  - ${s}`));
  }
  
  return parts.join('\n');
}