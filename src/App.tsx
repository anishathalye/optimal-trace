import { useState, useCallback, useEffect, useMemo } from 'react';
import './App.css';
import MapView from './components/MapView';
import type { Bbox } from './components/DrawControl';
import { useOverpass } from './hooks/useOverpass';
import type { GeoJSONFeatureCollection } from './hooks/useOverpass';
import { trailDistance, trailCount } from './utils/geo';
import buildGraph from './graph/build';
import { graphToFeatures } from './graph/features';
import { pruneGraph } from './graph/prune';
import type { Graph } from './graph/types';
import { pointKey } from './graph/types';
import { connectedComponents, oddDegreeNodes, totalEdgeDistance } from './graph/utils';
import { solveCPP, type CPPResult } from './solver/cpp';
import { generateGPX, downloadGPX } from './export/gpx';
import { fetchElevationProfile, type ElevationPoint } from './elevation/api';
import ElevationProfile from './components/ElevationProfile';
import { removeLogicalEdge } from './graph/mutate';

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

function formatArea(sqm: number): string {
  const sqmi = sqm / 2_589_988;
  if (sqmi >= 0.01) {
    return `${sqmi.toFixed(1)} mi²`;
  }
  const acres = sqm / 4046.86;
  if (acres >= 0.01) {
    return `${acres.toFixed(1)} acres`;
  }
  const sqft = sqm * 10.7639;
  return `${Math.round(sqft).toLocaleString()} ft²`;
}

function formatDistance(meters: number): string {
  const feet = meters * 3.28084;
  if (feet >= 5280) {
    return `${(feet / 5280).toFixed(1)} mi`;
  }
  return `${Math.round(feet).toLocaleString()} ft`;
}

function App() {
  const [drawing, setDrawing] = useState(false);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [includeRoads, setIncludeRoads] = useState(false);
  const [removedBatches, setRemovedBatches] = useState<Set<string>[]>([]);
  const [erasing, setErasing] = useState(false);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [buildingGraph, setBuildingGraph] = useState(false);
  const [selectingStart, setSelectingStart] = useState(false);
  const [startLat, setStartLat] = useState<number | null>(null);
  const [startLng, setStartLng] = useState<number | null>(null);
  const [cppResult, setCppResult] = useState<CPPResult | null>(null);
  const [solving, setSolving] = useState(false);
  const [elevationPoints, setElevationPoints] = useState<ElevationPoint[] | null>(null);
  const [elevationLoading, setElevationLoading] = useState(false);
  const [hoverPoint, setHoverPoint] = useState<{ lat: number; lng: number } | null>(null);
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

  const removedIds = useMemo(() => {
    const all = new Set<string>();
    for (const batch of removedBatches) {
      for (const id of batch) all.add(id);
    }
    return all;
  }, [removedBatches]);

  const startKey = startLat != null && startLng != null ? pointKey(startLat, startLng) : undefined;

  const logicalGraph = useMemo(() => {
    if (!graph) return null;
    return pruneGraph(graph, startKey);
  }, [graph, startKey]);

  const startNodeId = useMemo(() => {
    if (!logicalGraph || startKey == null) return null;
    return logicalGraph.nodes.has(startKey) ? startKey : null;
  }, [logicalGraph, startKey]);

  const trails = useMemo<GeoJSONFeatureCollection | null>(() => {
    if (!rawTrails) return null;
    return rawTrails;
  }, [rawTrails]);

  const displayTrails = useMemo(() => {
    if (logicalGraph) return graphToFeatures(logicalGraph);
    return rawTrails;
  }, [logicalGraph, rawTrails]);

  useEffect(() => {
    if (!rawTrails) return;
    setBuildingGraph(true);
    setTimeout(() => {
      try {
        const g = buildGraph(rawTrails.features);
        setGraph(g);
        setCppResult(null);
      } catch (err) {
        console.error('Graph build failed:', err);
      }
      setBuildingGraph(false);
    }, 0);
  }, [rawTrails]);

  const graphStats = useMemo(() => {
    if (!graph) return null;
    const logical = pruneGraph(graph);
    const components = connectedComponents(logical);
    const odd = oddDegreeNodes(logical);
    const dist = totalEdgeDistance(logical);
    return {
      rawNodes: graph.nodes.size,
      rawEdges: graph.edges.length,
      nodes: logical.nodes.size,
      edges: logical.edges.length,
      oddDegree: odd.length,
      components: components.length,
      distance: dist,
    };
  }, [graph]);

  const [showDebugGraph, setShowDebugGraph] = useState<'raw' | 'logical' | false>(false);
  const debugGraph = useMemo<Graph | null>(() => {
    if (!graph) return null;
    if (showDebugGraph === 'raw') return graph;
    if (showDebugGraph === 'logical') return logicalGraph;
    return null;
  }, [graph, logicalGraph, showDebugGraph]);

  const handleDrawEnd = useCallback((newBbox: Bbox) => {
    setBbox(newBbox);
    setDrawing(false);
  }, []);

  const handleToggleDraw = useCallback(() => {
    setDrawing((prev) => !prev);
  }, []);

  const handleClearBbox = useCallback(() => {
    setBbox(null);
    setRemovedBatches([]);
    setGraph(null);
    setStartLat(null);
    setStartLng(null);
    setCppResult(null);
    clearTrails();
  }, [clearTrails]);

  const handleFetchTrails = useCallback(() => {
    if (bbox) {
      setRemovedBatches([]);
      setGraph(null);
      setStartLat(null);
      setStartLng(null);
      fetchTrails(bbox, includeRoads);
    }
  }, [bbox, includeRoads, fetchTrails]);

  const handleClearTrails = useCallback(() => {
    setRemovedBatches([]);
    setGraph(null);
    setStartLat(null);
    setStartLng(null);
    clearTrails();
  }, [clearTrails]);

  const handleIncludeRoadsChange = useCallback(
    (checked: boolean) => {
      setIncludeRoads(checked);
      if (bbox && rawTrails) {
        setRemovedBatches([]);
        setGraph(null);
        setStartLat(null);
        setStartLng(null);
        fetchTrails(bbox, checked);
      }
    },
    [bbox, rawTrails, fetchTrails]
  );

  const handleFeatureClick = useCallback((featureId: string) => {
    if (!graph) return;
    const newGraph = removeLogicalEdge(graph, logicalGraph, featureId);
    setGraph(newGraph);
    setRemovedBatches((prev) => [...prev, new Set([featureId])]);
    setCppResult(null);
  }, [graph, logicalGraph]);

  const handleRestoreRemoved = useCallback(() => {
    if (!rawTrails) return;
    setGraph(buildGraph(rawTrails.features));
    setRemovedBatches([]);
    setStartLat(null);
    setStartLng(null);
  }, [rawTrails]);

  const handleUndo = useCallback(() => {
    if (!rawTrails) return;
    setRemovedBatches((prev) => {
      const next = prev.slice(0, -1);
      const base = buildGraph(rawTrails.features);
      const baseLogical = pruneGraph(base);
      const allRemaining = new Set<string>();
      for (const batch of next) {
        for (const id of batch) allRemaining.add(id);
      }
      let cur = base;
      let curLogical = baseLogical;
      for (const id of allRemaining) {
        cur = removeLogicalEdge(cur, curLogical, id);
        curLogical = pruneGraph(cur);
      }
      setGraph(cur);
      return next;
    });
  }, [rawTrails]);

  const handleEraseStart = useCallback(() => {
    setRemovedBatches((prev) => [...prev, new Set<string>()]);
  }, []);

  const handleEraseFeature = useCallback((featureId: string) => {
    setRemovedBatches((prev) => {
      const copy = [...prev];
      if (copy.length === 0) copy.push(new Set<string>());
      const last = new Set(copy[copy.length - 1]);
      last.add(featureId);
      copy[copy.length - 1] = last;
      return copy;
    });
    setGraph((g) => {
      if (!g) return g;
      const lg = pruneGraph(g);
      return removeLogicalEdge(g, lg, featureId);
    });
    setCppResult(null);
  }, []);

  const handleToggleSelectStart = useCallback(() => {
    setSelectingStart((prev) => {
      if (!prev) {
        setStartLat(null);
        setStartLng(null);
        setCppResult(null);
        return true;
      }
      return false;
    });
  }, []);

  const handleStartNodeSelected = useCallback((lat: number, lng: number) => {
    setStartLat(lat);
    setStartLng(lng);
    setSelectingStart(false);
  }, []);

  const handleComputeRoute = useCallback(() => {
    if (!logicalGraph || !startNodeId) return;
    setSolving(true);
    setTimeout(() => {
      try {
        const result = solveCPP(logicalGraph, startNodeId);
        setCppResult(result);

        setElevationLoading(true);
        fetchElevationProfile(result.coords)
          .then(setElevationPoints)
          .catch((err) => console.error('Elevation fetch failed:', err))
          .finally(() => setElevationLoading(false));
      } catch (err) {
        console.error('CPP solve failed:', err);
      }
      setSolving(false);
    }, 0);
  }, [logicalGraph, startNodeId]);

  const handleClearRoute = useCallback(() => {
    setCppResult(null);
    setElevationPoints(null);
    setHoverPoint(null);
  }, []);

  const handleExportGPX = useCallback(() => {
    if (!cppResult) return;
    const gpx = generateGPX(cppResult.coords, 'Trail Trace Route');
    downloadGPX(gpx, 'trail-trace-route.gpx');
  }, [cppResult]);

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
            trails={displayTrails}
            graph={debugGraph}
            logicalGraph={logicalGraph}
            showDebug={showDebugGraph !== false}
            startNodeId={startNodeId}
            selectingStart={selectingStart}
            erasing={erasing}
            routeSegments={cppResult?.segments ?? null}
            hoverPoint={hoverPoint}
            onDrawEnd={handleDrawEnd}
            onFeatureClick={handleFeatureClick}
            onStartNodeSelected={handleStartNodeSelected}
            onEraseStart={handleEraseStart}
            onEraseFeature={handleEraseFeature}
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
                ~{formatArea(bboxArea(bbox))}
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
                <button
                  className={`btn btn-secondary ${erasing ? 'btn-danger' : ''}`}
              onClick={() => {
                setErasing((prev) => !prev);
              }}>
                  {erasing ? 'Erasing\u2026 click to stop' : 'Erase'}
                </button>
                {removedBatches.length > 0 && (
                  <button className="btn btn-secondary" onClick={handleUndo}>
                    Undo
                  </button>
                )}
                {removedIds.size > 0 && (
                  <button className="btn btn-secondary" onClick={handleRestoreRemoved}>
                    Restore all
                  </button>
                )}
              </div>
            </>
          )}

          {trails && !erasing && (
            <p className="sidebar-hint">
              Click a trail segment on the map to remove it.
            </p>
          )}

          {trails && (
            <div className="sidebar-section">
              <button
                className={`btn ${selectingStart ? 'btn-active' : ''}`}
                onClick={handleToggleSelectStart}
              >
                {selectingStart ? 'Click map to set start\u2026' : 'Set Start Point'}
              </button>
              {startLat != null && (
                <p className="sidebar-note">
                  Start point set.
                  {' '}
                  ({startLat.toFixed(5)},{' '}
                  {startLng?.toFixed(5)})
                </p>
              )}
            </div>
          )}

          {buildingGraph && (
            <div className="sidebar-section">
              <p className="sidebar-loading">Building graph&hellip;</p>
            </div>
          )}

          {graph && graphStats && (
            <>
              <div className="sidebar-section">
                <h3>Graph</h3>
                <dl className="bbox-list">
                  <dt>Raw nodes</dt>
                  <dd>{graphStats.rawNodes}</dd>
                  <dt>Raw edges</dt>
                  <dd>{graphStats.rawEdges}</dd>
                  <dt>Logical nodes</dt>
                  <dd>{graphStats.nodes}</dd>
                  <dt>Logical edges</dt>
                  <dd>{graphStats.edges}</dd>
                  <dt>Odd-degree</dt>
                  <dd>{graphStats.oddDegree}</dd>
                  <dt>Components</dt>
                  <dd>{graphStats.components}</dd>
                  <dt>Total distance</dt>
                  <dd>{formatDistance(graphStats.distance)}</dd>
                </dl>
              </div>

              <div className="sidebar-section">
                <label className="sidebar-slider">
                  <span>Debug overlay</span>
                  <div className="slider-row">
                    <select
                      className="slider-input"
                      style={{ width: '100%' }}
                      value={showDebugGraph === false ? '' : showDebugGraph}
                      onChange={(e) => {
                        const v = e.target.value;
                        setShowDebugGraph(v === 'raw' || v === 'logical' ? v : false);
                      }}
                    >
                      <option value="">Off</option>
                      <option value="raw">Raw graph</option>
                      <option value="logical">Logical graph</option>
                    </select>
                  </div>
                </label>
              </div>

              {startNodeId && !cppResult && !solving && (
                <button className="btn btn-primary" onClick={handleComputeRoute}>
                  Compute Route
                </button>
              )}

              {solving && (
                <div className="sidebar-section">
                  <p className="sidebar-loading">Computing route&hellip;</p>
                </div>
              )}

              {cppResult && (
                <>
                  {cppResult.warning && (
                    <div className="sidebar-section">
                      <p className="sidebar-error">{cppResult.warning}</p>
                    </div>
                  )}

                  <div className="sidebar-section">
                    <h3>Route</h3>
                    <dl className="bbox-list">
                      <dt>Total distance</dt>
                      <dd>{formatDistance(cppResult.totalDistance)}</dd>
                      <dt>Unique trails</dt>
                      <dd>{formatDistance(cppResult.uniqueDistance)}</dd>
                      {cppResult.totalDistance > cppResult.uniqueDistance && (
                        <>
                          <dt>Retraced</dt>
                          <dd>{formatDistance(cppResult.totalDistance - cppResult.uniqueDistance)}</dd>
                        </>
                      )}
                    </dl>
                  </div>

                  <div className="sidebar-section">
                    <button className="btn btn-primary" onClick={handleExportGPX}>
                      Download GPX
                    </button>
                    <button className="btn btn-secondary" onClick={handleClearRoute}>
                      Clear Route
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {!bbox && !rawTrails && (
            <p className="sidebar-placeholder">
              Draw a rectangle on the map to select an area, then fetch trails.
              Select a starting point, and compute the optimal route covering every trail.
            </p>
          )}
        </aside>
      </div>

      {elevationPoints && elevationPoints.length > 1 && (
        <ElevationProfile points={elevationPoints} onHover={setHoverPoint} />
      )}
      {elevationLoading && (
        <div className="elevation-profile" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p className="sidebar-loading">Loading elevation&hellip;</p>
        </div>
      )}
    </div>
  );
}

export default App;
