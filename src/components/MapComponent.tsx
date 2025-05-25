
import React, { useEffect, useRef } from 'react';

interface Location {
  lat: number;
  lng: number;
  address: string;
}

interface MapComponentProps {
  currentLocation: Location | null;
}

const MapComponent: React.FC<MapComponentProps> = ({ currentLocation }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || !window.google) return;

    // Initialize map
    const map = new window.google.maps.Map(mapRef.current, {
      zoom: 13,
      center: currentLocation 
        ? { lat: currentLocation.lat, lng: currentLocation.lng }
        : { lat: 12.9716, lng: 77.5946 }, // Default to Bangalore
      mapTypeId: window.google.maps.MapTypeId.ROADMAP,
    });

    mapInstanceRef.current = map;

    // Add current location marker if available
    if (currentLocation) {
      new window.google.maps.Marker({
        position: { lat: currentLocation.lat, lng: currentLocation.lng },
        map: map,
        title: 'Your Current Location',
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="8" fill="#4285F4"/>
              <circle cx="12" cy="12" r="3" fill="white"/>
            </svg>
          `),
          scaledSize: new window.google.maps.Size(24, 24),
        }
      });

      // Add info window
      const infoWindow = new window.google.maps.InfoWindow({
        content: `<div class="p-2"><strong>Current Location</strong><br/>${currentLocation.address}</div>`
      });

      const marker = new window.google.maps.Marker({
        position: { lat: currentLocation.lat, lng: currentLocation.lng },
        map: map,
        title: 'Your Current Location'
      });

      marker.addListener('click', () => {
        infoWindow.open(map, marker);
      });
    }

    return () => {
      if (mapInstanceRef.current) {
        // Cleanup if needed
      }
    };
  }, [currentLocation]);

  return (
    <div 
      ref={mapRef} 
      className="w-full h-64 rounded-lg border border-gray-300"
      style={{ minHeight: '256px' }}
    />
  );
};

export default MapComponent;
