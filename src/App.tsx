import { useState, useCallback } from 'react';
import './App.css';
import MapView from './components/MapView';
import type { Bbox } from './components/DrawControl';

function formatCoord(value: number): string {
  return value.toFixed(6);
}

function bboxArea(bbox: Bbox): number {
  const latMid = (bbox.north + bbox.south) / 2;
  const latLen = (bbox.north - bbox.south) * 111320;
  const lonLen = (bbox.east - bbox.west) * 111320 * Math.cos((latMid * Math.PI) / 180);
  return Math.abs(latLen * lonLen);
}

function App() {
  const [drawing, setDrawing] = useState(false);
  const [bbox, setBbox] = useState<Bbox | null>(null);

  const handleDrawEnd = useCallback((newBbox: Bbox) => {
    setBbox(newBbox);
    setDrawing(false);
  }, []);

  const handleToggleDraw = useCallback(() => {
    setDrawing((prev) => !prev);
  }, []);

  const handleClearBbox = useCallback(() => {
    setBbox(null);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Trail Trace</h1>
        <span>Chinese Postman Route Planner</span>
      </header>
      <div className="app-main">
        <div className="map-area">
          <MapView drawing={drawing} bbox={bbox} onDrawEnd={handleDrawEnd} />
        </div>
        <aside className="sidebar">
          <h2>Controls</h2>

          <div className="sidebar-section">
            <button
              className={`btn ${drawing ? 'btn-active' : ''}`}
              onClick={handleToggleDraw}
            >
              {drawing ? 'Drawing\u2026 Click cancel' : 'Draw Rectangle'}
            </button>
            {bbox && (
              <button className="btn btn-secondary" onClick={handleClearBbox}>
                Clear
              </button>
            )}
          </div>

          {drawing && (
            <p className="sidebar-hint">
              Click and drag on the map to draw a rectangle.
            </p>
          )}

          {bbox ? (
            <div className="sidebar-section">
              <h3>Selected Area</h3>
              <dl className="bbox-list">
                <dt>North</dt>
                <dd>{formatCoord(bbox.north)}</dd>
                <dt>South</dt>
                <dd>{formatCoord(bbox.south)}</dd>
                <dt>East</dt>
                <dd>{formatCoord(bbox.east)}</dd>
                <dt>West</dt>
                <dd>{formatCoord(bbox.west)}</dd>
              </dl>
              <p className="sidebar-note">
                ~{Math.round(bboxArea(bbox) / 1_000_000).toLocaleString()} km²
              </p>
            </div>
          ) : (
            <p className="sidebar-placeholder">
              Draw a rectangle on the map to select an area, then fetch trails.
              Select a starting point, and compute the optimal route covering every trail.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

export default App;
