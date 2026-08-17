import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import './App.css';
import MapView from './components/MapView';
import type { Bbox, DrawMode } from './components/DrawControl';
import { useOverpass } from './hooks/useOverpass';
import type { GeoJSONFeatureCollection } from './hooks/useOverpass';
import { trailDistance, trailCount } from './utils/geo';
import buildGraph from './graph/build';
import { graphToFeatures, graphToPhysicalFeatures } from './graph/features';
import { pruneGraph } from './graph/prune';
import type { Graph } from './graph/types';
import { pointKey } from './graph/types';
import {
  connectedComponents,
  oddDegreeNodes,
  totalEdgeDistance,
} from './graph/utils';
import { solveCPP, type CPPResult } from './solver/cpp';
import {
  elevationLookupFromMap,
  routeMetricsFromElevations,
  type ElevationLookup,
  type RoutingMode,
} from './solver/costs';
import { solveWindyCPP } from './solver/windy';
import { solveLP } from './solver/glpk';
import { generateGPX, downloadGPX } from './export/gpx';
import {
  fetchElevationForAllCoords,
  fetchElevationForGraph,
  buildElevationProfile,
  type ElevationPoint,
} from './elevation/api';
import ElevationProfile from './components/ElevationProfile';
import {
  removeLogicalEdge,
  removeEdgeById,
  buildGraphWithRemovals,
} from './graph/mutate';

const VIEW_KEY = 'optimal-trace-view';
const SAVED_SELECTIONS_KEY = 'optimal-trace-selections';
const DEFAULT_CENTER: [number, number] = [40.0, -105.0];
const DEFAULT_ZOOM = 11;

interface CachedView {
  lat: number;
  lng: number;
  zoom: number;
}

interface SavedSelection {
  trails: GeoJSONFeatureCollection;
  removedBatches: string[][];
  savedAt: number;
}

type EraserMode = 'logical' | 'physical';

function loadSavedSelections(): Record<string, SavedSelection> {
  try {
    const raw = localStorage.getItem(SAVED_SELECTIONS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, SavedSelection>;
      }
    }
  } catch {
    /* ignore */
  }
  return {};
}

function persistSavedSelections(selections: Record<string, SavedSelection>) {
  try {
    localStorage.setItem(SAVED_SELECTIONS_KEY, JSON.stringify(selections));
  } catch {
    /* ignore - storage full or unavailable */
  }
}

function loadCachedView(): CachedView | null {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (
        typeof v.lat === 'number' &&
        typeof v.lng === 'number' &&
        typeof v.zoom === 'number'
      ) {
        return v;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function formatCoord(value: number): string {
  return value.toFixed(6);
}

function bboxArea(bbox: Bbox): number {
  const latMid = (bbox.north + bbox.south) / 2;
  const latLen = (bbox.north - bbox.south) * 111320;
  const lonLen =
    (bbox.east - bbox.west) * 111320 * Math.cos((latMid * Math.PI) / 180);
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

function formatElevation(meters: number): string {
  const feet = meters * 3.28084;
  return `${Math.round(feet).toLocaleString()} ft`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) {
    return `${Math.round(seconds)} s`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return `${hours}h ${minutes}m`;
}

function App() {
  const [drawing, setDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>('rectangle');
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [polygonCoords, setPolygonCoords] = useState<[number, number][] | null>(
    null,
  );
  const [includeRoads, setIncludeRoads] = useState(true);
  const [removedBatches, setRemovedBatches] = useState<Set<string>[]>([]);
  const [eraserMode, setEraserMode] = useState<EraserMode>('logical');
  const [savedSelections, setSavedSelections] =
    useState<Record<string, SavedSelection>>(loadSavedSelections);
  const [saveName, setSaveName] = useState('');
  const [erasing, setErasing] = useState(false);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [buildingGraph, setBuildingGraph] = useState(false);
  const [selectingStart, setSelectingStart] = useState(false);
  const [startLat, setStartLat] = useState<number | null>(null);
  const [startLng, setStartLng] = useState<number | null>(null);
  const [cppResult, setCppResult] = useState<CPPResult | null>(null);
  const [solving, setSolving] = useState(false);
  const [routeMode, setRouteMode] = useState<RoutingMode>('distance');
  const [previewing, setPreviewing] = useState(false);
  const [elevationPoints, setElevationPoints] = useState<
    ElevationPoint[] | null
  >(null);
  const [elevationLoading, setElevationLoading] = useState(false);
  const [elevationProgress, setElevationProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [elevationError, setElevationError] = useState<string | null>(null);
  const [fullElevations, setFullElevations] = useState<number[] | null>(null);
  const elevationAbortRef = useRef<AbortController | null>(null);
  const [exporting, setExporting] = useState(false);
  const [hoverPoint, setHoverPoint] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [center, setCenter] = useState<[number, number]>(() => {
    const cached = loadCachedView();
    return cached ? [cached.lat, cached.lng] : DEFAULT_CENTER;
  });
  const [zoom, setZoom] = useState(() => {
    const cached = loadCachedView();
    return cached?.zoom ?? DEFAULT_ZOOM;
  });

  const {
    trails: rawTrails,
    loading,
    error,
    fetch: fetchTrails,
    clear: clearTrails,
    restore: restoreTrails,
  } = useOverpass();

  useEffect(() => {
    if (loadCachedView()) return;
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCenter([pos.coords.latitude, pos.coords.longitude]);
        setZoom(13);
      },
      () => {
        /* silently ignore */
      },
      { timeout: 5000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    return () => {
      if (elevationAbortRef.current) {
        elevationAbortRef.current.abort();
      }
    };
  }, []);

  const removedIds = useMemo(() => {
    const all = new Set<string>();
    for (const batch of removedBatches) {
      for (const id of batch) all.add(id);
    }
    return all;
  }, [removedBatches]);

  const startKey =
    startLat != null && startLng != null
      ? pointKey(startLat, startLng)
      : undefined;

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

  const eraserTrails = useMemo(() => {
    if (eraserMode === 'physical' && graph) {
      return graphToPhysicalFeatures(graph);
    }
    return displayTrails;
  }, [eraserMode, graph, displayTrails]);

  const removedBatchesRef = useRef(removedBatches);
  useEffect(() => {
    removedBatchesRef.current = removedBatches;
  }, [removedBatches]);

  useEffect(() => {
    if (!rawTrails) return;
    setBuildingGraph(true);
    setTimeout(() => {
      try {
        const allRemoved = new Set<string>();
        for (const batch of removedBatchesRef.current) {
          for (const id of batch) allRemoved.add(id);
        }
        const g = buildGraphWithRemovals(rawTrails.features, allRemoved);
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

  const [showDebugGraph, setShowDebugGraph] = useState<
    'raw' | 'logical' | false
  >(false);
  const debugGraph = useMemo<Graph | null>(() => {
    if (!graph) return null;
    if (showDebugGraph === 'raw') return graph;
    if (showDebugGraph === 'logical') return logicalGraph;
    return null;
  }, [graph, logicalGraph, showDebugGraph]);

  const handleDrawEnd = useCallback(
    (newBbox: Bbox, coords?: [number, number][]) => {
      setBbox(newBbox);
      setPolygonCoords(coords ?? null);
      setDrawing(false);
    },
    [],
  );

  const handleToggleDraw = useCallback(() => {
    setDrawing((prev) => !prev);
  }, []);

  const handleClearBbox = useCallback(() => {
    setBbox(null);
    setPolygonCoords(null);
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
    [bbox, rawTrails, fetchTrails],
  );

  const handleFeatureClick = useCallback(
    (featureId: string) => {
      if (!graph) return;
      const newGraph = removeLogicalEdge(graph, logicalGraph, featureId);
      setGraph(newGraph);
      setRemovedBatches((prev) => [...prev, new Set([featureId])]);
      setCppResult(null);
    },
    [graph, logicalGraph],
  );

  const handleRestoreRemoved = useCallback(() => {
    if (!rawTrails) return;
    setGraph(buildGraph(rawTrails.features));
    setRemovedBatches([]);
    setStartLat(null);
    setStartLng(null);
  }, [rawTrails]);

  const handleSaveSelection = useCallback(() => {
    if (!rawTrails) return;
    const name = saveName.trim();
    if (!name) return;

    const entry: SavedSelection = {
      trails: rawTrails,
      removedBatches: removedBatches.map((batch) => Array.from(batch)),
      savedAt: Date.now(),
    };
    const next = { ...savedSelections, [name]: entry };
    setSavedSelections(next);
    persistSavedSelections(next);
    setSaveName('');
  }, [rawTrails, removedBatches, savedSelections, saveName]);

  const handleLoadSelection = useCallback(
    (name: string) => {
      const entry = savedSelections[name];
      if (!entry) return;

      if (elevationAbortRef.current) {
        elevationAbortRef.current.abort();
        elevationAbortRef.current = null;
      }

      setRemovedBatches(entry.removedBatches.map((ids) => new Set(ids)));
      restoreTrails(entry.trails);
      setStartLat(null);
      setStartLng(null);
      setCppResult(null);
      setElevationPoints(null);
      setFullElevations(null);
      setElevationProgress(null);
      setElevationError(null);
      setHoverPoint(null);
      setPreviewing(false);
      setSelectingStart(false);
      setErasing(false);
    },
    [savedSelections, restoreTrails],
  );

  const handleDeleteSelection = useCallback(
    (name: string) => {
      const next = { ...savedSelections };
      delete next[name];
      setSavedSelections(next);
      persistSavedSelections(next);
    },
    [savedSelections],
  );

  const handleUndo = useCallback(() => {
    if (!rawTrails) return;
    setRemovedBatches((prev) => {
      const next = prev.slice(0, -1);
      const allRemaining = new Set<string>();
      for (const batch of next) {
        for (const id of batch) allRemaining.add(id);
      }
      setGraph(buildGraphWithRemovals(rawTrails.features, allRemaining));
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
      return removeEdgeById(g, lg, featureId);
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

    if (elevationAbortRef.current) {
      elevationAbortRef.current.abort();
    }

    const controller = new AbortController();
    elevationAbortRef.current = controller;

    setSolving(true);
    setPreviewing(false);
    setCppResult(null);
    setElevationPoints(null);
    setFullElevations(null);
    setElevationProgress(null);
    setElevationError(null);

    (async () => {
      try {
        let elevationOf: ElevationLookup | undefined;
        if (routeMode !== 'distance') {
          setElevationLoading(true);
          const map = await fetchElevationForGraph(
            logicalGraph,
            controller.signal,
            (done, total) => {
              if (!controller.signal.aborted) {
                setElevationProgress({ done, total });
              }
            },
          );
          if (controller.signal.aborted) return;
          elevationOf = elevationLookupFromMap(map);
        }

        const result =
          routeMode === 'time'
            ? await solveWindyCPP(
                logicalGraph,
                startNodeId,
                elevationOf!,
                solveLP,
              )
            : solveCPP(logicalGraph, startNodeId, {
                mode: routeMode,
                elevationOf,
              });
        setCppResult(result);

        setElevationLoading(true);
        setElevationProgress(null);
        const elevations = await fetchElevationForAllCoords(
          result.coords,
          controller.signal,
          (done, total) => {
            if (!controller.signal.aborted) {
              setElevationProgress({ done, total });
            }
          },
        );
        if (controller.signal.aborted) return;
        setFullElevations(elevations);
        setElevationPoints(buildElevationProfile(result.coords, elevations));
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('CPP solve failed:', err);
          setElevationError(
            err instanceof Error ? err.message : 'Route computation failed',
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setElevationLoading(false);
        }
        setSolving(false);
      }
    })();
  }, [logicalGraph, startNodeId, routeMode]);

  const handleRouteModeChange = useCallback((mode: RoutingMode) => {
    setRouteMode(mode);
    setCppResult(null);
    setElevationPoints(null);
    setFullElevations(null);
    setElevationProgress(null);
    setElevationError(null);
    setHoverPoint(null);
    setPreviewing(false);
  }, []);

  const handleRetryElevation = useCallback(() => {
    if (!cppResult) return;

    if (elevationAbortRef.current) {
      elevationAbortRef.current.abort();
    }

    const controller = new AbortController();
    elevationAbortRef.current = controller;
    setElevationLoading(true);
    setElevationProgress(null);
    setElevationError(null);

    fetchElevationForAllCoords(
      cppResult.coords,
      controller.signal,
      (done, total) => {
        if (!controller.signal.aborted) {
          setElevationProgress({ done, total });
        }
      },
    )
      .then((elevations) => {
        if (!controller.signal.aborted) {
          setFullElevations(elevations);
          setElevationPoints(
            buildElevationProfile(cppResult.coords, elevations),
          );
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setElevationError(
            err instanceof Error ? err.message : 'Elevation fetch failed',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setElevationLoading(false);
        }
      });
  }, [cppResult]);

  const handleClearRoute = useCallback(() => {
    if (elevationAbortRef.current) {
      elevationAbortRef.current.abort();
      elevationAbortRef.current = null;
    }
    setCppResult(null);
    setSolving(false);
    setElevationPoints(null);
    setFullElevations(null);
    setElevationProgress(null);
    setElevationError(null);
    setHoverPoint(null);
    setPreviewing(false);
  }, []);

  const handleExportGPX = useCallback(async () => {
    if (!cppResult) return;
    setExporting(true);
    try {
      const elevations =
        fullElevations ?? (await fetchElevationForAllCoords(cppResult.coords));
      const gpx = generateGPX(
        cppResult.coords,
        'Optimal Trace Route',
        elevations,
      );
      downloadGPX(gpx, 'optimal-trace-route.gpx');
    } catch (err) {
      console.error('GPX export failed:', err);
    }
    setExporting(false);
  }, [cppResult, fullElevations]);

  const handleStartPreview = useCallback(() => {
    setPreviewing(true);
  }, []);

  const handlePreviewEnd = useCallback(() => {
    setPreviewing(false);
  }, []);

  const trailDist = trails ? trailDistance(trails) : 0;
  const numTrails = trails ? trailCount(trails) : 0;

  const routeStats = useMemo(() => {
    if (!cppResult) return null;

    const fromProfile =
      fullElevations && fullElevations.length > 1
        ? routeMetricsFromElevations(cppResult.coords, fullElevations)
        : null;

    return {
      elevationGain: fromProfile?.ascent ?? cppResult.elevationGain,
      estimatedTime: fromProfile?.time ?? cppResult.estimatedTime,
    };
  }, [cppResult, fullElevations]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Optimal Trace</h1>
        <a
          className="commit-hash"
          href="https://github.com/anishathalye/optimal-trace"
          target="_blank"
          rel="noopener noreferrer"
        >
          {__COMMIT_HASH__}
        </a>
      </header>
      <div className="app-main">
        <div className="map-area">
          <MapView
            drawing={drawing}
            drawMode={drawMode}
            bbox={rawTrails ? null : bbox}
            polygonCoords={rawTrails ? null : polygonCoords}
            trails={displayTrails}
            eraserTrails={eraserTrails}
            graph={debugGraph}
            logicalGraph={logicalGraph}
            showDebug={showDebugGraph !== false}
            startNodeId={startNodeId}
            selectingStart={selectingStart}
            erasing={erasing}
            routeSegments={cppResult?.segments ?? null}
            routeCoords={cppResult?.coords ?? null}
            previewing={previewing}
            onPreviewEnd={handlePreviewEnd}
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
            <label className="sidebar-slider">
              <span>Area shape</span>
              <select
                className="slider-input"
                style={{ width: '100%' }}
                value={drawMode}
                onChange={(e) => setDrawMode(e.target.value as DrawMode)}
              >
                <option value="rectangle">Rectangle</option>
                <option value="polygon">Polygon</option>
              </select>
            </label>
            <button
              className={`btn ${drawing ? 'btn-active' : ''}`}
              onClick={handleToggleDraw}
            >
              {drawing ? 'Drawing\u2026 Click cancel' : 'Select Area'}
            </button>
            {bbox && (
              <button className="btn btn-secondary" onClick={handleClearBbox}>
                Clear
              </button>
            )}
          </div>

          {drawing && (
            <p className="sidebar-hint">
              {drawMode === 'polygon'
                ? 'Click to add vertices. Click near first point or double-click to finish.'
                : 'Click and drag to draw a rectangle.'}
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
              <p className="sidebar-note">~{formatArea(bboxArea(bbox))}</p>
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
                <button
                  className="btn btn-secondary"
                  onClick={handleClearTrails}
                >
                  Clear Trails
                </button>
                <button
                  className={`btn btn-secondary ${erasing ? 'btn-danger' : ''}`}
                  onClick={() => {
                    setErasing((prev) => !prev);
                  }}
                >
                  {erasing ? 'Erasing\u2026 click to stop' : 'Erase'}
                </button>
                <label className="sidebar-slider">
                  <span>Erase mode</span>
                  <select
                    className="slider-input"
                    style={{ width: '100%' }}
                    value={eraserMode}
                    onChange={(e) =>
                      setEraserMode(e.target.value as EraserMode)
                    }
                  >
                    <option value="logical">Logical segment</option>
                    <option value="physical">Physical segment</option>
                  </select>
                </label>
                {removedBatches.length > 0 && (
                  <button className="btn btn-secondary" onClick={handleUndo}>
                    Undo
                  </button>
                )}
                {removedIds.size > 0 && (
                  <button
                    className="btn btn-secondary"
                    onClick={handleRestoreRemoved}
                  >
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

          {(trails || Object.keys(savedSelections).length > 0) && (
            <div className="sidebar-section">
              <h3>Saved selections</h3>
              {trails && (
                <div className="selection-save-row">
                  <input
                    type="text"
                    className="selection-name-input"
                    placeholder="Selection name"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveSelection();
                    }}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={handleSaveSelection}
                    disabled={!saveName.trim()}
                  >
                    Save
                  </button>
                </div>
              )}
              {Object.keys(savedSelections).length > 0 && (
                <ul className="selection-list">
                  {Object.entries(savedSelections).map(([name, entry]) => (
                    <li key={name} className="selection-item">
                      <div className="selection-info">
                        <span className="selection-name">{name}</span>
                        <span className="selection-meta">
                          {trailCount(entry.trails)} segments
                        </span>
                      </div>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleLoadSelection(name)}
                      >
                        Load
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleDeleteSelection(name)}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {trails && (
            <div className="sidebar-section">
              <button
                className={`btn ${selectingStart ? 'btn-active' : ''}`}
                onClick={handleToggleSelectStart}
              >
                {selectingStart
                  ? 'Click map to set start\u2026'
                  : 'Set Start Point'}
              </button>
              {startLat != null && (
                <p className="sidebar-note">
                  Start point set. ({startLat.toFixed(5)},{' '}
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
                        setShowDebugGraph(
                          v === 'raw' || v === 'logical' ? v : false,
                        );
                      }}
                    >
                      <option value="">Off</option>
                      <option value="raw">Raw graph</option>
                      <option value="logical">Logical graph</option>
                    </select>
                  </div>
                </label>
              </div>

              <div className="sidebar-section">
                <label className="sidebar-slider">
                  <span>Routing mode</span>
                  <select
                    className="slider-input"
                    style={{ width: '100%' }}
                    value={routeMode}
                    onChange={(e) =>
                      handleRouteModeChange(e.target.value as RoutingMode)
                    }
                  >
                    <option value="distance">Minimize distance</option>
                    <option value="elevation">Minimize elevation</option>
                    <option value="time">Minimize time</option>
                  </select>
                </label>
              </div>

              {startNodeId && !cppResult && !solving && (
                <button
                  className="btn btn-primary"
                  onClick={handleComputeRoute}
                >
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
                      <dt>Retraced</dt>
                      <dd>
                        {formatDistance(
                          cppResult.totalDistance - cppResult.uniqueDistance,
                        )}
                      </dd>
                      {routeStats?.elevationGain != null && (
                        <>
                          <dt>Elevation gain</dt>
                          <dd>{formatElevation(routeStats.elevationGain)}</dd>
                        </>
                      )}
                      {routeStats?.estimatedTime != null && (
                        <>
                          <dt>Estimated time</dt>
                          <dd>{formatDuration(routeStats.estimatedTime)}</dd>
                        </>
                      )}
                    </dl>
                  </div>

                  <div className="sidebar-section">
                    <button
                      className="btn btn-primary"
                      onClick={handleExportGPX}
                      disabled={exporting}
                    >
                      {exporting ? 'Exporting\u2026' : 'Download GPX'}
                    </button>
                    <button
                      className={`btn ${previewing ? 'btn-active' : ''}`}
                      onClick={handleStartPreview}
                    >
                      {previewing ? 'Playing preview\u2026' : 'Preview Route'}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={handleClearRoute}
                    >
                      Clear Route
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {!bbox && !rawTrails && (
            <p className="sidebar-placeholder">
              Select an area on the map, then fetch trails. Select a starting
              point, and compute the optimal route covering every trail.
            </p>
          )}
        </aside>
      </div>

      {elevationPoints && elevationPoints.length > 1 && (
        <ElevationProfile points={elevationPoints} onHover={setHoverPoint} />
      )}
      {elevationLoading && (
        <div
          className="elevation-profile"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {elevationProgress ? (
            <div className="elevation-progress-bar">
              <div
                className="elevation-progress-fill"
                style={{
                  width: `${Math.round(
                    (elevationProgress.done / elevationProgress.total) * 100,
                  )}%`,
                }}
              />
            </div>
          ) : (
            <p className="sidebar-loading">Loading elevation&hellip;</p>
          )}
        </div>
      )}
      {elevationError && !elevationLoading && (
        <div
          className="elevation-profile"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <p className="sidebar-error">{elevationError}</p>
          <button className="btn btn-secondary" onClick={handleRetryElevation}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
