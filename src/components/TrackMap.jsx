import { useEffect } from 'react';
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// suit la dernière position
function Follow({ at }) {
  const map = useMap();
  useEffect(() => { if (at) map.panTo(at, { animate: true }); }, [at?.[0], at?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Carte du parcours en cours (le tracé ne quitte pas le téléphone).
// fix : dernière position reçue (même imprécise), avec sa précision en mètres
export default function TrackMap({ points, center, fix }) {
  const here = fix ? [fix.lat, fix.lng] : null;
  const last = here || points[points.length - 1] || (center ? [center.lat, center.lng] : [50.85, 4.35]);
  return (
    <MapContainer center={last} zoom={16} className="h-64 w-full rounded-2xl" scrollWheelZoom={false} attributionControl>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {points.length > 1 && <Polyline positions={points} pathOptions={{ color: '#ea580c', weight: 5, opacity: 0.85 }} />}
      {points.length > 0 && <CircleMarker center={points[0]} radius={6} pathOptions={{ color: '#16a34a', fillOpacity: 1 }} />}
      {here && fix.acc > 0 && <Circle center={here} radius={fix.acc} pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.12 }} />}
      {(here || points.length > 0) && <CircleMarker center={last} radius={8} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }} />}
      <Follow at={here || (points.length ? last : null)} />
    </MapContainer>
  );
}
