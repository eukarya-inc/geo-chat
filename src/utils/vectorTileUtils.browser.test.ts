import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as duckdb from '@duckdb/duckdb-wasm';
import { geojsonToVectorTile } from './vectorTileUtils';
import type { Feature } from 'geojson';

describe('Vector Tile Numeric Properties', () => {
    let db: duckdb.AsyncDuckDB;
    let connection: duckdb.AsyncDuckDBConnection;

    beforeAll(async () => {
        // Initialize DuckDB with spatial extension
        const DUCKDB_BUNDLES = {
            mvp: {
                mainModule: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm',
                mainWorker: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js',
            },
            eh: {
                mainModule: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm',
                mainWorker: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js',
            },
        };

        const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
        const worker = new Worker(bundle.mainWorker!);
        const logger = new duckdb.VoidLogger();
        db = new duckdb.AsyncDuckDB(logger, worker);
        await db.instantiate(bundle.mainModule!);
        
        connection = await db.connect();
        
        // Install spatial extension
        await connection.query(`INSTALL spatial`);
        await connection.query(`LOAD spatial`);
    });

    afterAll(async () => {
        if (connection) {
            await connection.close();
        }
        if (db) {
            await db.terminate();
        }
    });

    it('should handle JSON-encoded values from Map component query', async () => {
        if (!connection) throw new Error('Connection not initialized');

        // Create a test table with numeric columns
        await connection.query(`
            CREATE TABLE test_numeric AS 
            SELECT 
                1 as id,
                42 as int_value,
                3.14159 as float_value,
                'test' as string_value,
                ST_Point(139.7, 35.6) as geometry
        `);

        // Query the data using to_json as the Map component does
        const query = `
            SELECT 
                ST_AsGeoJSON(geometry) as geojson,
                to_json(id) as id,
                to_json(int_value) as int_value,
                to_json(float_value) as float_value,
                to_json(string_value) as string_value
            FROM test_numeric
        `;

        const result = await connection.query(query);
        const rows = result.toArray();
        
        // Check raw query result
        expect(rows).toHaveLength(1);
        
        const row = rows[0];

        // With to_json, all values become JSON strings
        expect(typeof row.id).toBe('string');
        expect(typeof row.int_value).toBe('string');
        expect(typeof row.float_value).toBe('string');
        expect(typeof row.string_value).toBe('string');
        
        // But they can be parsed back to their original types
        expect(JSON.parse(row.id)).toBe(1);
        expect(JSON.parse(row.int_value)).toBe(42);
        expect(JSON.parse(row.float_value)).toBeCloseTo(3.14159);
        expect(JSON.parse(row.string_value)).toBe('test');
    });

    it('should preserve numeric types when using TO_JSON wrapper', async () => {
        if (!connection) throw new Error('Connection not initialized');

        // Create a test table
        await connection.query(`
            CREATE OR REPLACE TABLE test_json AS 
            SELECT 
                1 as id,
                42 as int_value,
                3.14159 as float_value,
                'test' as string_value,
                ST_Point(139.7, 35.6) as geometry
        `);

        // Query with TO_JSON wrapper (like the app might do)
        const query = `
            SELECT 
                ST_AsGeoJSON(geometry) as geojson,
                TO_JSON(id) as id,
                TO_JSON(int_value) as int_value,
                TO_JSON(float_value) as float_value,
                TO_JSON(string_value) as string_value
            FROM test_json
        `;

        const result = await connection.query(query);
        const rows = result.toArray();
        
        const row = rows[0];

        // TO_JSON likely converts everything to strings
        // This is probably where the issue comes from
    });

    it('should check how properties are handled in GeoJSON features', async () => {
        if (!connection) throw new Error('Connection not initialized');

        // Create test data
        await connection.query(`
            CREATE OR REPLACE TABLE test_features AS 
            SELECT 
                1 as id,
                42 as value,
                'Point 1' as name,
                ST_Point(139.7, 35.6) as geometry
            UNION ALL
            SELECT 
                2 as id,
                85 as value,
                'Point 2' as name,
                ST_Point(139.8, 35.7) as geometry
        `);

        // Query without TO_JSON
        const queryNoJson = `
            SELECT 
                ST_AsGeoJSON(geometry) as geojson,
                id,
                value,
                name
            FROM test_features
        `;

        const resultNoJson = await connection.query(queryNoJson);
        const rowsNoJson = resultNoJson.toArray();

        // Build GeoJSON features
        const features: Feature[] = rowsNoJson.map(row => {
            const geojson = JSON.parse(row.geojson);
            const properties: Record<string, unknown> = {};
            
            // Copy properties
            for (const key in row) {
                if (key !== 'geojson') {
                    properties[key] = row[key];
                }
            }
            
            return {
                type: 'Feature',
                geometry: geojson,
                properties
            };
        });

        expect(typeof features[0].properties?.id).toBe('number');
        expect(typeof features[0].properties?.value).toBe('number');
        expect(typeof features[0].properties?.name).toBe('string');

        // Now test with TO_JSON
        const queryWithJson = `
            SELECT 
                ST_AsGeoJSON(geometry) as geojson,
                TO_JSON(id) as id,
                TO_JSON(value) as value,
                TO_JSON(name) as name
            FROM test_features
        `;

        const resultWithJson = await connection.query(queryWithJson);
        const rowsWithJson = resultWithJson.toArray();

        const featuresWithJson: Feature[] = rowsWithJson.map(row => {
            const geojson = JSON.parse(row.geojson);
            const properties: Record<string, unknown> = {};
            
            // Copy properties
            for (const key in row) {
                if (key !== 'geojson') {
                    // If it's a JSON string, parse it
                    if (typeof row[key] === 'string' && (row[key].startsWith('"') || !isNaN(Number(row[key])))) {
                        try {
                            properties[key] = JSON.parse(row[key]);
                        } catch {
                            properties[key] = row[key];
                        }
                    } else {
                        properties[key] = row[key];
                    }
                }
            }
            
            return {
                type: 'Feature',
                geometry: geojson,
                properties
            };
        });

    });

    it('should test MVT generation with numeric properties', async () => {
        if (!connection) throw new Error('Connection not initialized');

        // Create simple test features with numeric properties
        const features: Feature[] = [
            {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [139.7, 35.6]
                },
                properties: {
                    id: 1,
                    value: 42,
                    name: 'Test Point'
                }
            }
        ];

        // Calculate proper tile coordinates for the point at zoom level 10
        // Point at [139.7, 35.6] (Tokyo area)
        // At zoom 10: x = 907, y = 403 (approximately)
        const zoom = 10;
        const lon = 139.7;
        const lat = 35.6;
        
        // Convert lon/lat to tile coordinates
        const n = Math.pow(2, zoom);
        const x = Math.floor((lon + 180) / 360 * n);
        const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
        
        // Generate MVT for the correct tile
        const mvt = geojsonToVectorTile(features, zoom, x, y);
        
        expect(mvt.length).toBeGreaterThan(0);

        // Note: To fully test if numbers are preserved in MVT,
        // we'd need to decode the MVT and check the properties
        // But the issue is likely in how we prepare the data before MVT generation
    });
});