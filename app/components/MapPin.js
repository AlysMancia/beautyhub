'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

const PH_CENTER = [12.8797, 121.774];

/**
 * OpenStreetMap map with one draggable pin. Click the map or drag the pin to set
 * `value` ({ lat, lng } or null). `center` moves the view (e.g. to the chosen barangay).
 */
export default function MapPin({ value, center, onChange, height = 320 }) {
  const box = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const L = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Create the map once (Leaflet needs `window`, so it is loaded here).
  useEffect(() => {
    let cancelled = false;
    import('leaflet').then((mod) => {
      if (cancelled || map.current) return;
      L.current = mod.default ?? mod;
      const start = value ? [value.lat, value.lng] : center ? [center.lat, center.lng] : PH_CENTER;
      map.current = L.current.map(box.current, { scrollWheelZoom: false }).setView(start, value ? 17 : center ? 15 : 5);
      L.current
        .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        })
        .addTo(map.current);
      map.current.on('click', (e) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
      if (value) placeMarker(value);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function placeMarker(pos) {
    if (!map.current || !L.current) return;
    if (!marker.current) {
      const icon = L.current.divIcon({ className: 'map-pin', html: '<span></span>', iconSize: [28, 28], iconAnchor: [14, 28] });
      marker.current = L.current.marker([pos.lat, pos.lng], { draggable: true, icon }).addTo(map.current);
      marker.current.on('dragend', () => {
        const p = marker.current.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
    } else {
      marker.current.setLatLng([pos.lat, pos.lng]);
    }
  }

  // Keep the pin in sync with `value`.
  useEffect(() => {
    if (!map.current) return;
    if (value) placeMarker(value);
    else if (marker.current) {
      marker.current.remove();
      marker.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);

  // Move the view when the chosen area changes.
  useEffect(() => {
    if (map.current && center) map.current.setView([center.lat, center.lng], 16);
  }, [center?.lat, center?.lng]);

  return <div ref={box} className="map-box" style={{ height }} />;
}
