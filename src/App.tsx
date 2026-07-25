import { useState, useCallback, useEffect, useMemo } from 'react';
import './App.css';
import MapView from './components/MapView';
import type { Bbox } from './components/DrawControl';
import { useOverpass } from './hooks/useOverpass';
import type { GeoJSONFeatureCollection } from './hooks/useOverpass';
import { trailDistance, trailCount, filterByMinLength } from './utils/geo';

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
  const [minLength, setMinLength] = useState(0);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [center, setCenter] = useState<[number, number]>(() => {
    const cached = loadCachedView();
    return cached ? [cached.lat, cached.lng] : DEFAULT_CENTER;
  });
  const [zoom, setZoom] = useState(() => {
    const cached = loadCachedView();
    return cached?.zoom ?? DEFAULT_ZOOM;
  });

  const { trails: rawTrails, loading, error, fetch: fetchTrails, clear: clearTrails } = useOverpass();

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

  const trails = useMemo<GeoJSONFeatureCollection | null>(() => {
    if (!rawTrails) return null;
    let filtered = filterByMinLength(rawTrails.features, minLength);
    if (removedIds.size > 0) {
      filtered = filtered.filter((f) => !f.id || !removedIds.has(f.id));
    }
    return { type: 'FeatureCollection', features: filtered };
  }, [rawTrails, minLength, removedIds]);

  const handleDrawEnd = useCallback((newBbox: Bbox) => {
    setBbox(newBbox);
    setDrawing(false);
  }, []);

  const handleToggleDraw = useCallback(() => {
    setDrawing((prev) => !prev);
  }, []);

  const handleClearBbox = useCallback(() => {
    setBbox(null);
    setRemovedIds(new Set());
    clearTrails();
  }, [clearTrails]);

  const handleFetchTrails = useCallback(() => {
    if (bbox) {
      setRemovedIds(new Set());
      fetchTrails(bbox, includeRoads);
    }
  }, [bbox, includeRoads, fetchTrails]);

  const handleClearTrails = useCallback(() => {
    setRemovedIds(new Set());
    clearTrails();
  }, [clearTrails]);

  const handleIncludeRoadsChange = useCallback(
    (checked: boolean) => {
      setIncludeRoads(checked);
      if (bbox && rawTrails) {
        setRemovedIds(new Set());
        fetchTrails(bbox, checked);
      }
    },
    [bbox, rawTrails, fetchTrails]
  );

  const handleFeatureClick = useCallback((featureId: string) => {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.add(featureId);
      return next;
    });
  }, []);

  const handleRestoreRemoved = useCallback(() => {
    setRemovedIds(new Set());
  }, []);

  const handleMinLengthChange = useCallback((value: number) => {
    setMinLength(value);
  }, []);

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
            onFeatureClick={handleFeatureClick}
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

          {bbox && !rawTrails && !loading && (
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

          {rawTrails && (
            <div className="sidebar-section">
              <label className="sidebar-slider">
                <span>Min segment length</span>
                <div className="slider-row">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={minLength}
                    onChange={(e) => handleMinLengthChange(Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="slider-input"
                    min={0}
                    step={0.1}
                    value={minLength}
                    onChange={(e) => handleMinLengthChange(Number(e.target.value))}
                  />
                  <span className="slider-unit">m</span>
                </div>
              </label>
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

              <div className="sidebar-section">
                <button className="btn btn-secondary" onClick={handleClearTrails}>
                  Clear Trails
                </button>
                {removedIds.size > 0 && (
                  <button className="btn btn-secondary" onClick={handleRestoreRemoved}>
                    Restore {removedIds.size} removed
                  </button>
                )}
              </div>
            </>
          )}

          {trails && (
            <p className="sidebar-hint">
              Click a trail segment on the map to remove it.
            </p>
          )}

          {!bbox && !rawTrails && (
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
