import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { Table } from 'apache-arrow';
import { ArrowService } from './arrowService';

// Interface for potential future GeoArrow metadata support
// interface GeoArrowMetadata {
//   crs?: string;
//   geometryType: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon';
//   dimensions: 'XY' | 'XYZ' | 'XYM' | 'XYZM';
// }

/**
 * Service for handling geospatial data with Arrow and DuckDB
 * Implements GeoArrow specification for efficient spatial data transfer
 */
export class GeoArrowService {
  private arrowService: ArrowService;
  private db: AsyncDuckDB;

  constructor(db: AsyncDuckDB) {
    this.db = db;
    this.arrowService = new ArrowService(db);
  }

  /**
   * Query spatial data and return as GeoArrow table
   */
  async querySpatialAsGeoArrow(query: string): Promise<Table> {
    // Ensure spatial extension is loaded
    const conn = await this.db.connect();
    try {
      await conn.query("LOAD spatial");
    } catch {
      // Already loaded
    } finally {
      await conn.close();
    }

    // Execute query and get Arrow table
    return this.arrowService.queryAsArrow(query);
  }

  /**
   * Convert DuckDB geometry to GeoArrow format
   */
  async convertToGeoArrow(tableName: string, geomColumn: string = 'geom'): Promise<Table> {
    // Query to extract coordinates from geometry
    const query = `
      SELECT 
        *,
        ST_X(${geomColumn}) as x,
        ST_Y(${geomColumn}) as y,
        ST_AsText(${geomColumn}) as wkt
      FROM ${tableName}
      WHERE ${geomColumn} IS NOT NULL
    `;

    return this.arrowService.queryAsArrow(query);
  }

  /**
   * Create a spatial index on a geometry column
   */
  async createSpatialIndex(tableName: string, geomColumn: string = 'geom'): Promise<void> {
    const conn = await this.db.connect();
    try {
      await conn.query(`
        CREATE INDEX ${tableName}_${geomColumn}_idx 
        ON ${tableName} 
        USING RTREE (${geomColumn})
      `);
    } finally {
      await conn.close();
    }
  }

  /**
   * Perform spatial join using Arrow for efficient data transfer
   */
  async spatialJoin(
    leftTable: string,
    rightTable: string,
    predicate: 'intersects' | 'contains' | 'within' | 'touches' = 'intersects',
    leftGeom: string = 'geom',
    rightGeom: string = 'geom'
  ): Promise<Table> {
    const spatialFunc = {
      intersects: 'ST_Intersects',
      contains: 'ST_Contains',
      within: 'ST_Within',
      touches: 'ST_Touches'
    }[predicate];

    const query = `
      SELECT 
        l.*,
        r.* EXCLUDE (${rightGeom})
      FROM ${leftTable} l
      JOIN ${rightTable} r
      ON ${spatialFunc}(l.${leftGeom}, r.${rightGeom})
    `;

    return this.arrowService.queryAsArrow(query);
  }

  /**
   * Buffer geometries and return as Arrow table
   */
  async bufferGeometries(
    tableName: string,
    distance: number,
    geomColumn: string = 'geom'
  ): Promise<Table> {
    const query = `
      SELECT 
        *,
        ST_Buffer(${geomColumn}, ${distance}) as buffered_geom
      FROM ${tableName}
      WHERE ${geomColumn} IS NOT NULL
    `;

    return this.arrowService.queryAsArrow(query);
  }

  /**
   * Compute spatial statistics using Arrow
   */
  async computeSpatialStats(tableName: string, geomColumn: string = 'geom'): Promise<{
    totalFeatures: number;
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
    avgArea: number;
    totalArea: number;
  }> {
    const conn = await this.db.connect();
    try {
      const result = await conn.query(`
        SELECT 
          COUNT(*) as total_features,
          MIN(ST_XMin(${geomColumn})) as min_x,
          MIN(ST_YMin(${geomColumn})) as min_y,
          MAX(ST_XMax(${geomColumn})) as max_x,
          MAX(ST_YMax(${geomColumn})) as max_y,
          AVG(ST_Area(${geomColumn})) as avg_area,
          SUM(ST_Area(${geomColumn})) as total_area
        FROM ${tableName}
        WHERE ${geomColumn} IS NOT NULL
      `);

      const stats = result.toArray()[0];
      return {
        totalFeatures: stats.total_features,
        bbox: {
          minX: stats.min_x,
          minY: stats.min_y,
          maxX: stats.max_x,
          maxY: stats.max_y
        },
        avgArea: stats.avg_area,
        totalArea: stats.total_area
      };
    } finally {
      await conn.close();
    }
  }

  /**
   * Simplify geometries for visualization
   */
  async simplifyGeometries(
    tableName: string,
    tolerance: number,
    geomColumn: string = 'geom'
  ): Promise<Table> {
    const query = `
      SELECT 
        * EXCLUDE (${geomColumn}),
        ST_Simplify(${geomColumn}, ${tolerance}) as ${geomColumn}
      FROM ${tableName}
      WHERE ${geomColumn} IS NOT NULL
    `;

    return this.arrowService.queryAsArrow(query);
  }

  /**
   * Convert Arrow table with lat/lon columns to spatial table
   */
  async createSpatialTableFromCoords(
    tableName: string,
    arrowTable: Table,
    lonColumn: string,
    latColumn: string
  ): Promise<void> {
    // First load the Arrow table
    await this.arrowService.loadArrowTable(`${tableName}_temp`, arrowTable);

    // Then create spatial table
    const conn = await this.db.connect();
    try {
      await conn.query(`
        CREATE TABLE ${tableName} AS
        SELECT 
          *,
          ST_Point(${lonColumn}, ${latColumn}) as geom
        FROM ${tableName}_temp
        WHERE ${lonColumn} IS NOT NULL AND ${latColumn} IS NOT NULL
      `);

      // Drop temporary table
      await conn.query(`DROP TABLE ${tableName}_temp`);
    } finally {
      await conn.close();
    }
  }
}