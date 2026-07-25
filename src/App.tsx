import './App.css';
import MapView from './components/MapView';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Trail Trace</h1>
        <span>Chinese Postman Route Planner</span>
      </header>
      <div className="app-main">
        <div className="map-area">
          <MapView />
        </div>
        <aside className="sidebar">
          <h2>Controls</h2>
          <p className="sidebar-placeholder">
            Draw a rectangle on the map to select an area, then fetch trails.
            Select a starting point, and compute the optimal route covering every trail.
          </p>
        </aside>
      </div>
    </div>
  );
}

export default App;
