import { useState } from 'react';
import ChatPanel from './ChatPanel';
import MapView from './MapView';
import DataPanel from './DataPanel';
import { DuckDBStatus } from './DuckDBStatus';
import './Layout.css';

function Layout() {
  const [showDataPanel, setShowDataPanel] = useState(false);

  return (
    <div className="app-layout">
      <div className="main-content">
        <div className="chat-section">
          <ChatPanel />
        </div>
        <div className="map-section">
          <MapView />
          <button 
            className="data-panel-toggle"
            onClick={() => setShowDataPanel(!showDataPanel)}
            title={showDataPanel ? 'Hide data panel' : 'Show data panel'}
          >
            {showDataPanel ? '📊' : '📊'}
          </button>
        </div>
      </div>
      {showDataPanel && (
        <div className="data-panel-overlay">
          <DataPanel onClose={() => setShowDataPanel(false)} />
        </div>
      )}
      <DuckDBStatus />
    </div>
  );
}

export default Layout;
