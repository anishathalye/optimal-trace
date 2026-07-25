import { useState, useCallback, useEffect } from 'react';
import './App.css';
import MapView from './components/MapView';
import type { Bbox } from './components/DrawControl';
import { useOverpass } from './hooks/useOverpass';
import { trailDistance, trailCount } from './utils/geo';

const VIEW_KEY = 'trail-trace-view';
const DEFAULT_CENTER: [number, number] = [40.0, -105.0];
const DEFAULT_ZOOM = 11;

interface CachedView {
  lat: number;
  lng: number;
  zoom: number;
}

function loadCachedView(): CachedView | null {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (typeof v.lat === 'number' && typeof v.lng === 'number' && typeof v.zoom === 'number') {
        return v;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function formatCoord(value: number): string {
  return value.toFixed(6);
}

function bboxArea(bbox: Bbox): number {
  const latMid = (bbox.north + bbox.south) / 2;
  const latLen = (bbox.north - bbox.south) * 111320;
  const lonLen = (bbox.east - bbox.west) * 111320 * Math.cos((latMid * Math.PI) / 180);
  return Math.abs(latLen * lonLen);
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

function App() {
  const [drawing, setDrawing] = useState(false);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [includeRoads, setIncludeRoads] = useState(false);
  const [center, setCenter] = useState<[number, number]>(() => {
    const cached = loadCachedView();
    return cached ? [cached.lat, cached.lng] : DEFAULT_CENTER;
  });
  const [zoom, setZoom] = useState(() => {
    const cached = loadCachedView();
    return cached?.zoom ?? DEFAULT_ZOOM;
  });

  const { trails, loading, error, fetch: fetchTrails, clear: clearTrails } = useOverpass();

  useEffect(() => {
    if (loadCachedView()) return;
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter([pos.coords.latitude, pos.coords.longitude]);
        setZoom(13);
      },
      () => { /* silently ignore */ },
      { timeout: 5000, maximumAge: 300000 }
    );
  }, []);

  const handleDrawEnd = useCallback((newBbox: Bbox) => {
    setBbox(newBbox);
    setDrawing(false);
  }, []);

  const handleToggleDraw = useCallback(() => {
    setDrawing((prev) => !prev);
  }, []);

  const handleClearBbox = useCallback(() => {
    setBbox(null);
    clearTrails();
  }, [clearTrails]);

  const handleFetchTrails = useCallback(() => {
    if (bbox) fetchTrails(bbox, includeRoads);
  }, [bbox, includeRoads, fetchTrails]);

  const handleClearTrails = useCallback(() => {
    clearTrails();
  }, [clearTrails]);

  const handleIncludeRoadsChange = useCallback(
    (checked: boolean) => {
      setIncludeRoads(checked);
      if (bbox && trails) {
        fetchTrails(bbox, checked);
      }
    },
    [bbox, trails, fetchTrails]
  );

  const trailDist = trails ? trailDistance(trails) : 0;
  const numTrails = trails ? trailCount(trails) : 0;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Trail Trace</h1>
        <span>Chinese Postman Route Planner</span>
      </header>
      <div className="app-main">
        <div className="map-area">
          <MapView
            drawing={drawing}
            bbox={bbox}
            trails={trails}
            onDrawEnd={handleDrawEnd}
            center={center}
            zoom={zoom}
          />
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

          {bbox && (
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
          )}

          {bbox && (
            <label className="sidebar-checkbox">
              <input
                type="checkbox"
                checked={includeRoads}
                onChange={(e) => handleIncludeRoadsChange(e.target.checked)}
              />
              <span>Include roads</span>
            </label>
          )}

          {bbox && !trails && !loading && (
            <button className="btn btn-primary" onClick={handleFetchTrails}>
              Fetch Trails
            </button>
          )}

          {loading && (
            <div className="sidebar-section">
              <p className="sidebar-loading">Fetching trails&hellip;</p>
            </div>
          )}

          {error && (
            <div className="sidebar-section">
              <p className="sidebar-error">{error}</p>
            </div>
          )}

          {trails && (
            <>
              <div className="sidebar-section">
                <h3>Trails</h3>
                <dl className="bbox-list">
                  <dt>Segments</dt>
                  <dd>{numTrails}</dd>
                  <dt>Distance</dt>
                  <dd>{formatDistance(trailDist)}</dd>
                </dl>
              </div>

              <button className="btn btn-secondary" onClick={handleClearTrails}>
                Clear Trails
              </button>
            </>
          )}

          {!bbox && !trails && (
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
