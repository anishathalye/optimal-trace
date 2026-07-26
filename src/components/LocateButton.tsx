import { useState, useCallback, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import './LocateButton.css';

function LocateButton() {
  const map = useMap();
  const [locating, setLocating] = useState(false);
  const [marker, setMarker] = useState<L.Marker | null>(null);

  useEffect(() => {
    return () => {
      if (marker) marker.remove();
    };
  }, [marker]);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const latlng = L.latLng(latitude, longitude);

        if (marker) marker.remove();

        const newMarker = L.marker(latlng, {
          title: 'Your location',
        }).addTo(map);

        setMarker(newMarker);
        map.setView(latlng, 15, { animate: true });
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            alert(
              'Location access denied. Please enable location permissions in your browser settings.',
            );
            break;
          case error.POSITION_UNAVAILABLE:
            alert('Location information is unavailable.');
            break;
          case error.TIMEOUT:
            alert('The request to get your location timed out.');
            break;
          default:
            alert('An unknown error occurred while getting your location.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }, [map, marker]);

  return (
    <button
      className={`locate-button ${locating ? 'locating' : ''}`}
      onClick={handleLocate}
      title="Go to my location"
      aria-label="Go to my location"
      disabled={locating}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
    </button>
  );
}

export default LocateButton;
