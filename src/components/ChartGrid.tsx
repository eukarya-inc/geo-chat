import React, { useRef, useEffect, useState, useMemo } from 'react';
import VegaLiteChart from './VegaLiteChart';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { DBStateManager } from '../lib/duckdb/dbStateManager';
import type { VegaLiteSpec } from '../types/vega';

export interface ChartSpec {
  id: string;
  spec: VegaLiteSpec;
  timestamp: Date;
  title?: string;
}

interface ChartGridProps {
  charts: ChartSpec[];
  db?: AsyncDuckDB;
  dbStateManager?: DBStateManager;
}

export const ChartGrid: React.FC<ChartGridProps> = ({ charts, db, dbStateManager }) => {
  // Account for p-4 (32px) + p-4 inside (32px) + action buttons (~40px) = 104px
  const CONTAINER_PADDING = 104;
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 400 });

  // Measure container size only once when component mounts or charts change
  useEffect(() => {
    const measureContainer = () => {
      if (containerRef.current && charts.length > 0) {
        const rect = containerRef.current.getBoundingClientRect();
        // Account for padding and ensure minimum size
        const width = Math.max(400, rect.width - CONTAINER_PADDING);
        const height = Math.max(300, rect.height - CONTAINER_PADDING);
        setDimensions(prev => {
          // Only update if dimensions actually changed
          if (prev.width !== width || prev.height !== height) {
            return { width, height };
          }
          return prev;
        });
      }
    };

    // Small delay to ensure DOM is fully rendered
    const timeoutId = setTimeout(measureContainer, 100);
    return () => clearTimeout(timeoutId);
  }, [charts]); // Depend on charts array reference

  useEffect(() => {
    // Handle window resize with debouncing
    let resizeTimeout: number;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        if (containerRef.current && charts.length > 0) {
          const rect = containerRef.current.getBoundingClientRect();
          const width = Math.max(400, rect.width - CONTAINER_PADDING);
          const height = Math.max(300, rect.height - CONTAINER_PADDING);
          setDimensions({ width, height });
        }
      }, 300); // Debounce resize events
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, [charts.length]);
  if (charts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <p className="text-lg mb-2">プレビューを表示できません</p>
          <p className="text-sm">テーブルを選択してください</p>
        </div>
      </div>
    );
  }

  // Create spec with measured dimensions
  const getSpecWithDimensions = (spec: VegaLiteSpec): VegaLiteSpec => {
    return {
      ...spec,
      width: dimensions.width,
      height: dimensions.height,
      padding: 0,  // Remove default Vega padding
      autosize: {
        type: 'fit',
        contains: 'padding'
      }
    };
  };

  return (
    <div ref={containerRef} className="h-full overflow-y-auto overflow-x-hidden">
      {charts.length === 1 ? (
        // Single chart - display with measured size
        <div className="p-4">
          <div className="bg-white rounded-lg shadow-sm p-4">
            {useMemo(() => (
              <VegaLiteChart 
                key={charts[0].id}
                spec={getSpecWithDimensions(charts[0].spec)} 
                db={db} 
                dbStateManager={dbStateManager} 
              />
            ), [charts[0].id, charts[0].spec, dimensions.width, dimensions.height, db, dbStateManager])}
          </div>
        </div>
      ) : (
        // Multiple charts - grid layout
        <div className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {charts.map((chart) => (
              <div key={chart.id} className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-3 border-b border-gray-200">
                  <h3 className="font-medium text-gray-800">
                    {chart.title || 'Chart'}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {chart.timestamp.toLocaleString('ja-JP')}
                  </p>
                </div>
                <div className="p-4">
                  <VegaLiteChart 
                    spec={getSpecWithDimensions(chart.spec)} 
                    db={db} 
                    dbStateManager={dbStateManager} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};