import { useAtomValue } from 'jotai';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';

import { detectGeometryColumn, detectGeometryKind, getTableBounds } from '@/lib/map/geometry';
import { defaultMapStyle, type GeometryKind } from '@/lib/map/mapSpec';
import { invalidateTable, registerTileProtocol } from '@/lib/map/tileProtocol';
import { mapStylesAtom, selectedTableAtom } from '@/store/atoms';
import { NoTableHint, TablePicker } from '@/components/workspace/TablePicker';
import { BASE_STYLE } from './basemap';
import { clearTableSource, LAYER_ID, setTableLayer, setTableSource } from './mapLayers';

registerTileProtocol();

interface GeometryInfo {
    column: string | null;
    kind: GeometryKind;
}

export function MapPanel() {
    const table = useAtomValue(selectedTableAtom);
    const mapStyles = useAtomValue(mapStylesAtom);
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const [ready, setReady] = useState(false);
    const [info, setInfo] = useState<GeometryInfo | null>(null);

    // Create the map once.
    useEffect(() => {
        if (!containerRef.current) return;
        const map = new maplibregl.Map({
            container: containerRef.current,
            style: BASE_STYLE,
            center: [0, 20],
            zoom: 1,
        });
        map.addControl(new maplibregl.NavigationControl(), 'top-right');
        map.on('load', () => setReady(true));

        // Feature popup listing properties.
        map.on('click', LAYER_ID, e => {
            const feature = e.features?.[0];
            if (!feature) return;
            const rows = Object.entries(feature.properties ?? {})
                .map(
                    ([k, v]) => `<tr><td style="padding-right:8px;font-weight:600">${k}</td><td>${String(v)}</td></tr>`
                )
                .join('');
            new maplibregl.Popup({ maxWidth: '320px' })
                .setLngLat(e.lngLat)
                .setHTML(`<table style="font-size:12px">${rows}</table>`)
                .addTo(map);
        });
        map.on('mouseenter', LAYER_ID, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', LAYER_ID, () => (map.getCanvas().style.cursor = ''));

        mapRef.current = map;
        return () => {
            map.remove();
            mapRef.current = null;
            setReady(false);
        };
    }, []);

    // On table change: detect geometry, wire the source, fit bounds.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        if (!table) {
            clearTableSource(map);
            setInfo(null);
            return;
        }
        let cancelled = false;
        (async () => {
            const column = await detectGeometryColumn(table);
            if (cancelled || mapRef.current !== map) return;
            if (!column) {
                clearTableSource(map);
                setInfo({ column: null, kind: 'point' });
                return;
            }
            const kind = await detectGeometryKind(table, column);
            if (cancelled || mapRef.current !== map) return;
            invalidateTable(table);
            setTableSource(map, table);
            setInfo({ column, kind });
            const bounds = await getTableBounds(table, column);
            if (!cancelled && bounds) map.fitBounds(bounds, { padding: 40, duration: 800, maxZoom: 16 });
        })();
        return () => {
            cancelled = true;
        };
    }, [table, ready]);

    // Apply / re-apply the layer when the table's style (or geometry kind) changes.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready || !table || !info?.column) return;
        const style = mapStyles[table] ?? defaultMapStyle(info.kind);
        setTableLayer(map, style);
    }, [table, ready, info, mapStyles]);

    return (
        <div className="relative h-full min-h-0">
            <div className="absolute top-3 left-3 z-10 rounded-md border bg-white/90 px-2 py-1 shadow-sm">
                <TablePicker />
            </div>
            <div ref={containerRef} className="h-full w-full" />
            {!table && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <NoTableHint />
                </div>
            )}
            {table && info?.column === null && (
                <div className="text-muted-foreground absolute right-3 bottom-8 left-3 rounded-md border bg-white/90 p-3 text-center text-sm shadow-sm">
                    Table “{table}” has no geometry column to display.
                </div>
            )}
        </div>
    );
}
