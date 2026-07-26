import { CircleMarker, Polyline } from 'react-leaflet';
import type { Graph } from '../graph/types';

interface GraphDebugLayerProps {
  graph: Graph;
  showNodes: boolean;
  showEdges: boolean;
}

function GraphDebugLayer({
  graph,
  showNodes,
  showEdges,
}: GraphDebugLayerProps) {
  return (
    <>
      {showEdges &&
        graph.edges.map((edge, i) => (
          <Polyline
            key={`edge-${i}`}
            positions={edge.coords.map((c) => [c[1], c[0]] as [number, number])}
            pathOptions={{
              color: '#3388ff',
              weight: 1.5,
              opacity: 0.6,
            }}
          />
        ))}
      {showNodes &&
        Array.from(graph.nodes.entries()).map(([id, node]) => (
          <CircleMarker
            key={`node-${id}`}
            center={[node.lat, node.lng]}
            radius={3}
            pathOptions={{
              color: '#3388ff',
              fillColor: '#3388ff',
              fillOpacity: 0.8,
              weight: 1,
            }}
          />
        ))}
    </>
  );
}

export default GraphDebugLayer;
