# Optimal Trace — Implementation Plan

A frontend-only web app for computing the Chinese Postman Problem (CPP) route over trail networks. Users select a rectangular area on a map, pick a starting point, and get an optimal route covering every trail segment.

**Stack:** React 18+ · TypeScript · Vite · Leaflet (react-leaflet) · Overpass API · `edmonds-blossom`

---

## Phase 0: Project Scaffolding

**Objective:** Create the Vite + React + TypeScript project and install core dependencies.

- `npm create vite@latest optimal-trace -- --template react-ts`
- Install dependencies:
  ```
  react-leaflet leaflet @types/leaflet
  leaflet-draw @types/leaflet-draw
  osmtogeojson @types/osmtogeojson
  edmonds-blossom
  graph-data-structure
  @turf/distance @turf/helpers @turf/nearest-point
  geokdbush
  ```
- Set up basic App layout — title bar, map area, sidebar placeholders
- Configure Leaflet CSS imports (`leaflet/dist/leaflet.css`, `leaflet-draw/dist/leaflet.draw.css`)
- Fix Leaflet icon paths (Vite quirk with marker icon URLs)

**Deliverable:** App boots, shows a full-window OSM map, no build errors.

---

## Phase 1: Map Viewer + Rectangle Selection

**Objective:** Let the user pan/zoom the map and draw a rectangular bounding box to define the area of interest.

**Key tasks:**
1. Add `FeatureGroup` + `EditControl` from `leaflet-draw` (imperatively via `useMap()` hook)
2. Restrict draw controls to **rectangle only** (hide polygon, circle, marker, polyline)
3. On rectangle created, store the bounding box coords in state (`[south, west, north, east]`)
4. Display the bbox coordinates in the sidebar (read-only for now)
5. Allow clearing the rectangle and drawing a new one
6. Show a subtle translucent overlay for the selected area

**Deliverable:** User can draw a rectangle on the map; coordinates appear in the sidebar.

---

## Phase 2: Fetch & Display OSM Trail Data

**Objective:** Query the Overpass API for all trails within the selected rectangle and render them on the map.

**Key tasks:**
1. Add a "Fetch Trails" button in the sidebar (enabled only when a bbox is selected)
2. Build the Overpass query — filter for `highway=path|footway|track|bridleway|steps` plus cycleways, with optional `sac_scale`/`trail_visibility` awareness
3. POST to `https://overpass-api.de/api/interpreter` with the query
4. Parse the JSON response with `osmtogeojson` into GeoJSON `FeatureCollection`
5. Render trail lines on the map as a `GeoJSON` layer
6. Handle loading state (spinner), errors (rate limits, empty results, timeouts), and empty results
7. Display trail count and total distance in the sidebar
8. Optional: add a fallback Overpass endpoint (`https://overpass.private.coffee/api/interpreter`)

**Detailed Overpass query:**
```
[out:json][timeout:30];
(
  way["highway"="path"]({south},{west},{north},{east});
  way["highway"="footway"]({south},{west},{north},{east});
  way["highway"="track"]({south},{west},{north},{east});
  way["highway"="bridleway"]({south},{west},{north},{east});
  way["highway"="steps"]({south},{west},{north},{east});
  way["highway"="cycleway"]({south},{west},{north},{east});
);
(._;>;);
out geom;
```

**Deliverable:** After drawing a rectangle and clicking "Fetch Trails", trail lines appear on the map.

---

## Phase 3: Graph Construction & Start Point Selection

**Objective:** Convert the fetched GeoJSON trail lines into a clean graph suitable for CPP computation, and let the user pick a starting point.

**Key tasks:**
1. Build an undirected weighted graph from trail GeoJSON:
   - Nodes = unique coordinates (rounded to ~6 decimal places to merge near-duplicates)
   - Edges = trail segments between nodes, weighted by haversine distance (meters)
   - Handle MultiLineString and split Linestrings at known junctions
2. Deduplicate overlapping/parallel trail segments (merge or pick the best)
3. Remove isolated components that don't connect to the main trail network
4. Build a spatial index (`geokdbush`) for O(1) nearest-node lookups
5. Render graph nodes (small circles) and edges on the map as a debug overlay (toggleable)
6. Allow user to click a point on the map → snap to nearest graph node → display "Start" marker
7. Show graph stats in the sidebar: node count, edge count, odd-degree vertex count, number of connected components

**Deliverable:** Fetched trails are converted to a graph. User clicks to set start point. Graph stats are visible.

---

## Phase 4: Chinese Postman Problem Computation

**Objective:** Implement the CPP algorithm in TypeScript, entirely in the browser.

**Algorithm (undirected CPP, same start/end):**
1. **Find odd-degree vertices.** Sum the degrees. If zero odd vertices, graph is already Eulerian.
2. **All-pairs shortest paths.** Compute shortest-path distances between every pair of odd-degree vertices using Dijkstra (from `graph-data-structure` or hand-rolled).
3. **Minimum-weight perfect matching.** Use `edmonds-blossom` to pair odd vertices, minimizing total path distance.
4. **Duplicate matched paths.** For each matched pair, double the edges along the shortest path between them.
5. **Generate Euler circuit.** Run Hierholzer's algorithm on the augmented (Eulerian) graph, starting from the user's chosen start node.

**Key implementation files:**
- `src/solver/graph.ts` — graph data structure (adjacency list, add edge, duplicate edge, degree queries)
- `src/solver/dijkstra.ts` — single-source shortest paths
- `src/solver/all-pairs.ts` — all-pairs shortest paths for odd vertices
- `src/solver/matching.ts` — wrapper around `edmonds-blossom` (construct edge list for odd vertex pairs, parse result)
- `src/solver/euler.ts` — Hierholzer's algorithm (DFS-based edge traversal)
- `src/solver/cpp.ts` — orchestrator: takes graph + start node, returns ordered list of node IDs

**Edge cases to handle:**
- Disconnected graph: only solve the connected component containing the start node (warn user about unreachable trails)
- Graph with zero edges or one edge
- Very large graphs: show a progress indicator for matching/dijkstra phases

**Deliverable:** After clicking "Compute Route", the optimal CPP route is calculated and stored as an ordered list of coordinates.

---

## Phase 5: Route Display & GPX Export

**Objective:** Render the computed route on the map and allow the user to export it as a GPX file.

**Key tasks:**
1. Render the CPP route as a distinct, brightly-colored polyline on the map (over the trail lines)
2. Differentiate between "first traversal" (trail segments) and "retraced" edges (duplicated paths) with different colors or dashes
3. Show route statistics in the sidebar:
   - Total distance (km/miles)
   - Unique trail coverage (km/miles)
   - Total retraced distance
   - Estimated time (configurable pace: min/km or min/mile)
   - Elevation gain/loss if available from OSM (optional)
4. Add a toggle to show/hide the route
5. Implement GPX export:
   - Build a GPX 1.1 XML document with `<trk>` → `<trkseg>` → `<trkpt>` elements
   - Each track point includes lat, lon, and optional `<ele>` if elevation data is available
   - Trigger file download via `URL.createObjectURL` + `<a>` click
6. Add a "Download GPX" button (enabled only when a route exists)
7. Optional: allow user to toggle between "same start/end" (standard CPP) and "different start/end" (Open CPP) — parity correction differs

**Deliverable:** Computed route is displayed on the map with stats. User can download a GPX file.

---

## Phase 6: Polish & Edge Cases

**Objective:** Handle real-world data quirks and improve UX.

- Gracefully degrade for disconnected trail components
- Handle Overpass API rate limiting (429 responses) with retry/backoff
- Detect and warn about directed trail segments (one-way bike paths, etc.)
- Add dark mode for the map (CartoDB dark tiles)
- Mobile-responsive layout
- Keyboard shortcuts (Esc to clear, Enter to fetch, etc.)
- Save/restore state via localStorage (last bbox, last query area)
- Option to ignore steps or specific highway types

---

## Phase 7 (Future): Advanced Features

- Multiple start/end points (Open CPP)
- Multi-day splitting (k-Chinese Postman / capacitated arc routing)
- Elevation-aware routing (Windy CPP)
- Rural Postman (required vs optional edges)
- User-editable graph (add/remove/connect trails manually)
- Import/export graph state
- Offline support (PWA)
- Backend version using Python/OSMnx/NetworkX for larger graphs

---

## Architecture Overview

```
src/
├── main.tsx                   # Entry point
├── App.tsx                    # Root component, state management
├── components/
│   ├── MapView.tsx            # Leaflet map + rectangle draw control
│   ├── Sidebar.tsx            # Controls, stats, export buttons
│   ├── TrailLayer.tsx         # GeoJSON layer for fetched trails
│   ├── RouteLayer.tsx         # CPP route polyline overlay
│   └── GraphDebugLayer.tsx    # Optional graph node/edge viz
├── osm/
│   ├── query.ts               # Build & execute Overpass API queries
│   └── parser.ts              # Convert OSM JSON → GeoJSON (osmtogeojson wrapper)
├── graph/
│   ├── build.ts               # GeoJSON → graph construction + dedup
│   ├── types.ts               # Node, Edge, Graph interfaces
│   └── spatial.ts             # geokdbush nearest-neighbor index
├── solver/
│   ├── dijkstra.ts            # Single-source shortest paths
│   ├── all-pairs.ts           # All-pairs shortest paths (odd vertices only)
│   ├── matching.ts            # edmonds-blossom integration
│   ├── euler.ts               # Hierholzer's algorithm
│   └── cpp.ts                 # Orchestrator: full CPP pipeline
├── export/
│   └── gpx.ts                 # GPX XML generation + download trigger
├── utils/
│   ├── geo.ts                 # Haversine distance, bbox operations
│   └── turf.ts                # @turf wrappers (distance, nearest, etc.)
└── hooks/
    ├── useOverpass.ts         # Data fetching hook with loading/error state
    └── useCppSolver.ts        # Web Worker or async solver hook
```

## Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Map library | Leaflet (react-leaflet v5) | Free tiles, mature drawing plugin, simple API |
| Rectangle drawing | leaflet-draw (imperative) | `react-leaflet-draw` is unmaintained; imperative via `useMap()` is reliable |
| Overpass CORS | Direct `fetch()` from browser | Overpass API sends CORS headers natively — no proxy needed |
| Graph structure | Custom adjacency list (`Map<string, Map<string, number>>`) | Minimal overhead, full control, easy to serialize |
| Matching algorithm | `edmonds-blossom` (v1.0.0) | Stable algorithm, zero deps, only npm Blossom implementation available |
| GPX export | Hand-rolled XML template | GPX 1.1 is trivial (~30 lines), no dependency needed |
| Spatial queries | `geokdbush` | Fastest JS KNN for geo points, same author as Leaflet |
| State management | React `useState`/`useReducer` | App state is simple enough; no need for Redux/Zustand |
