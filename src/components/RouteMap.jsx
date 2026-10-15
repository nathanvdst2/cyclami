import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { t } from '../i18n/index.js';

// Tracé d'une sortie (issu d'un GPX importé) : ligne, départ et arrivée.
// route : [[lat, lng], …] ; start : point de rendez-vous { lat, lng } (facultatif)
export default function RouteMap({ route, start, height = 'h-56' }) {
  if (!route?.length) return null;
  const lats = route.map((p) => p[0]);
  const lngs = route.map((p) => p[1]);
  const bounds = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
  const first = route[0];
  const last = route[route.length - 1];
  const loop = Math.abs(first[0] - last[0]) < 0.0005 && Math.abs(first[1] - last[1]) < 0.0005;
  return (
    <MapContainer bounds={bounds} boundsOptions={{ padding: [16, 16] }} className={`${height} w-full rounded-2xl`}
      scrollWheelZoom={false} attributionControl>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Polyline positions={route} pathOptions={{ color: '#0f766e', weight: 5, opacity: 0.85 }} />
      {!loop && (
        <CircleMarker center={last} radius={6} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 }}>
          <Tooltip>{t('Arrivée')}</Tooltip>
        </CircleMarker>
      )}
      <CircleMarker center={first} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#059669', fillOpacity: 1 }}>
        <Tooltip>{loop ? t('Départ et arrivée') : t('Départ')}</Tooltip>
      </CircleMarker>
      {start && (Math.abs(start.lat - first[0]) > 0.001 || Math.abs(start.lng - first[1]) > 0.001) && (
        <CircleMarker center={[start.lat, start.lng]} radius={6} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }}>
          <Tooltip>{t('Point de rendez-vous')}</Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
