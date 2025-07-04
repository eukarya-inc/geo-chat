import React, { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { 
  addLayer, 
  removeLayer, 
  updateLayerVisibility,
  reorderLayer,
  duplicateLayer
} from '../store/slices/layerSlice';
import { LayerType } from '../types/layer.types';

interface LayerPanelProps {
  onLayerSelect?: (layerId: string) => void;
}

export const LayerPanel: React.FC<LayerPanelProps> = ({ onLayerSelect }) => {
  const dispatch = useAppDispatch();
  const { layers, layerOrder, datasets } = useAppSelector(state => state.layers);
  const [showAddLayer, setShowAddLayer] = React.useState(false);

  const handleAddLayer = useCallback((type: LayerType, dataId: string) => {
    dispatch(addLayer({ type, dataId }));
    setShowAddLayer(false);
  }, [dispatch]);

  const handleRemoveLayer = useCallback((layerId: string) => {
    if (window.confirm('Remove this layer?')) {
      dispatch(removeLayer(layerId));
    }
  }, [dispatch]);

  const handleToggleVisibility = useCallback((layerId: string, isVisible: boolean) => {
    dispatch(updateLayerVisibility({ layerId, isVisible }));
  }, [dispatch]);

  const handleDuplicateLayer = useCallback((layerId: string) => {
    dispatch(duplicateLayer(layerId));
  }, [dispatch]);

  const handleMoveLayer = useCallback((oldIndex: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? oldIndex - 1 : oldIndex + 1;
    if (newIndex >= 0 && newIndex < layerOrder.length) {
      dispatch(reorderLayer({ oldIndex, newIndex }));
    }
  }, [dispatch, layerOrder.length]);

  const orderedLayers = layerOrder.map(id => layers.find(l => l.id === id)).filter(Boolean);

  return (
    <div style={{ fontSize: '13px' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '10px'
      }}>
        <strong style={{ fontSize: '14px' }}>Layers</strong>
        <button
          onClick={() => setShowAddLayer(!showAddLayer)}
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          + Add Layer
        </button>
      </div>

      {/* Add layer dropdown */}
      {showAddLayer && datasets.length > 0 && (
        <div style={{
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '4px',
          padding: '10px',
          marginBottom: '10px'
        }}>
          <div style={{ marginBottom: '8px', fontSize: '12px', color: '#666' }}>
            Select layer type and data:
          </div>
          <select
            onChange={(e) => {
              const [type, dataId] = e.target.value.split(':');
              if (type && dataId) {
                handleAddLayer(type as LayerType, dataId);
              }
            }}
            defaultValue=""
            style={{
              width: '100%',
              padding: '6px',
              fontSize: '12px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          >
            <option value="">Choose layer type...</option>
            {datasets.map(dataset => (
              <optgroup key={dataset.id} label={dataset.label}>
                <option value={`point:${dataset.id}`}>Point Layer</option>
                <option value={`polygon:${dataset.id}`}>Polygon Layer</option>
                <option value={`line:${dataset.id}`}>Line Layer</option>
                <option value={`heatmap:${dataset.id}`}>Heatmap Layer</option>
                <option value={`hexagon:${dataset.id}`}>Hexagon Layer</option>
                <option value={`grid:${dataset.id}`}>Grid Layer</option>
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {/* Layer list */}
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        {orderedLayers.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: '#666', 
            padding: '20px',
            fontSize: '12px'
          }}>
            No layers yet. Add a layer to visualize your data.
          </div>
        ) : (
          orderedLayers.map((layer, index) => layer && (
            <div
              key={layer.id}
              style={{
                backgroundColor: '#fff',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '8px',
                overflow: 'hidden'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px',
                backgroundColor: layer.config.isVisible ? '#f8f9fa' : '#e9ecef',
                cursor: 'pointer'
              }}
              onClick={() => onLayerSelect?.(layer.id)}
              >
                {/* Visibility toggle */}
                <input
                  type="checkbox"
                  checked={layer.config.isVisible}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleToggleVisibility(layer.id, e.target.checked);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ marginRight: '8px' }}
                />

                {/* Layer color indicator */}
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    backgroundColor: `rgb(${layer.config.color.join(',')})`,
                    borderRadius: '3px',
                    marginRight: '8px',
                    flexShrink: 0
                  }}
                />

                {/* Layer name */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{layer.config.label}</div>
                  <div style={{ fontSize: '11px', color: '#666' }}>
                    {layer.type} • {datasets.find(d => d.id === layer.config.dataId)?.label || 'Unknown data'}
                  </div>
                </div>

                {/* Layer controls */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {/* Move up */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveLayer(index, 'up');
                    }}
                    disabled={index === 0}
                    style={{
                      padding: '2px 6px',
                      fontSize: '11px',
                      backgroundColor: 'transparent',
                      border: '1px solid #ddd',
                      borderRadius: '3px',
                      cursor: index === 0 ? 'not-allowed' : 'pointer',
                      opacity: index === 0 ? 0.5 : 1
                    }}
                    title="Move up"
                  >
                    ↑
                  </button>

                  {/* Move down */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveLayer(index, 'down');
                    }}
                    disabled={index === layerOrder.length - 1}
                    style={{
                      padding: '2px 6px',
                      fontSize: '11px',
                      backgroundColor: 'transparent',
                      border: '1px solid #ddd',
                      borderRadius: '3px',
                      cursor: index === layerOrder.length - 1 ? 'not-allowed' : 'pointer',
                      opacity: index === layerOrder.length - 1 ? 0.5 : 1
                    }}
                    title="Move down"
                  >
                    ↓
                  </button>

                  {/* Duplicate */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicateLayer(layer.id);
                    }}
                    style={{
                      padding: '2px 6px',
                      fontSize: '11px',
                      backgroundColor: 'transparent',
                      border: '1px solid #ddd',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                    title="Duplicate"
                  >
                    ⎘
                  </button>

                  {/* Delete */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveLayer(layer.id);
                    }}
                    style={{
                      padding: '2px 6px',
                      fontSize: '11px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};