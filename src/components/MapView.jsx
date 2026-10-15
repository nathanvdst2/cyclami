import { useEffect, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import PlacesLayer, { PLACE_KINDS } from './PlacesLayer.jsx';
import { t } from '../i18n/index.js';
import { usePageState } from '../lib/persist.js';

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// Marqueur rond avec la photo du membre, ou un emoji.
function bubbleIcon({ emoji, photoUrl, highlight }) {
  const ring = highlight ? '#0f766e' : '#ffffff';
  const inner = photoUrl
    ? `<img src="${escapeHtml(photoUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:9999px" />`
    : `<span style="font-size:22px;line-height:1">${escapeHtml(emoji || '🚴')}</span>`;
  return L.divIcon({
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
    html: `<div style="width:40px;height:40px;border-radius:9999px;background:#ccfbf1;border:3px solid ${ring};
      box-shadow:0 2px 6px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;overflow:hidden">${inner}</div>`,
  });
}

const pinIcon = L.divIcon({
  className: '',
  iconSize: [32, 40],
  iconAnchor: [16, 40],
  html: '<div style="font-size:34px;line-height:1;filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))">📍</div>',
});

// Ma position exacte en direct (point bleu, comme sur les applis de cartes). Jamais enregistrée :
// elle reste sur le téléphone. Démarre seule si la localisation est déjà autorisée, sinon via le bouton.
const meIcon = L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: '<div class="me-dot"></div>' });

function MyLocation() {
  const map = useMap();
  const [pos, setPos] = useState(null);
  const [error, setError] = useState(null);
  const watch = useRef(null);
  const follow = useRef(false);
  const box = useRef(null);
  // le bouton ne doit pas compter comme un clic sur la carte (choix du point de rendez-vous)
  useEffect(() => { if (box.current) L.DomEvent.disableClickPropagation(box.current); }, []);

  const start = (center) => {
    if (!navigator.geolocation) { setError(t('Localisation indisponible sur cet appareil.')); return; }
    follow.current = center;
    if (watch.current != null) {
      if (center && pos) map.flyTo([pos.lat, pos.lng], Math.max(map.getZoom(), 15));
      return;
    }
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        setPos(next);
        setError(null);
        if (follow.current) { map.flyTo([next.lat, next.lng], Math.max(map.getZoom(), 15)); follow.current = false; }
      },
      () => { setError(t('Position refusée : autorise la localisation dans les réglages.')); watch.current = null; },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
  };

  useEffect(() => {
    navigator.permissions?.query({ name: 'geolocation' }).then((r) => { if (r.state === 'granted') start(false); }).catch(() => {});
    return () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {pos && pos.accuracy < 1000 && (
        <Circle center={[pos.lat, pos.lng]} radius={pos.accuracy} interactive={false}
          pathOptions={{ color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.12 }} />
      )}
      {pos && <Marker position={[pos.lat, pos.lng]} icon={meIcon} zIndexOffset={1000} interactive={false} />}
      <div className="leaflet-top leaflet-right" ref={box}>
        <div className="leaflet-control leaflet-bar">
          <button type="button" onClick={() => start(true)} title={t('Me localiser')} aria-label={t('Me localiser')}
            className="flex h-[30px] w-[30px] items-center justify-center bg-white text-blue-600">
            <LocateFixed size={16} />
          </button>
        </div>
        {error && <div className="leaflet-control max-w-[12rem] rounded-lg bg-white px-2 py-1 text-xs text-red-600 shadow">{error}</div>}
      </div>
    </>
  );
}

function ClickToPick({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

// garde la position et le zoom de la carte (retour depuis la page d'un lieu)
function ViewKeeper({ onChange }) {
  useMapEvents({ moveend: (e) => { const m = e.target; const c = m.getCenter(); onChange({ lat: c.lat, lng: c.lng, zoom: m.getZoom() }); } });
  return null;
}

function Recenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView([center.lat, center.lng], map.getZoom());
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * markers : [{ id, coords: {lat, lng}, emoji, photoUrl, highlight, popup: <ReactNode> }]
 * onPick / picked : mode « choisir un point » (formulaire de sortie)
 * places : affiche les lieux utiles aux cyclistes (bornes de réparation, magasins vélo, points d'eau, gonflage) ; onChoosePlace(lieu) optionnel
 */
export default function MapView({ center, zoom = 13, markers = [], onPick, picked, height = 'h-80', places = false, onChoosePlace, onProposeRide, onOpenPlace, stateKey }) {
  const start = center || markers[0]?.coords || { lat: 50.6, lng: 4.6 }; // Belgique par défaut
  // stateKey : filtres et position gardés dans l'historique (retour arrière, actualisation)
  const [keptKinds, setKeptKinds] = usePageState(`map:${stateKey || 'local'}:kinds`, []);
  const [localKinds, setLocalKinds] = useState([]);
  const [kinds, setKinds] = stateKey ? [keptKinds, setKeptKinds] : [localKinds, setLocalKinds];
  const [savedView, setSavedView] = usePageState(`map:${stateKey || 'local'}:view`, null);
  const view = stateKey ? savedView : null;
  const [status, setStatus] = useState(null);
  const toggle = (id) => setKinds((ks) => (ks.includes(id) ? ks.filter((k) => k !== id) : [...ks, id]));
  return (
    <div className="space-y-2">
      {places && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => toggle('fav')}
            className={`chip px-2 py-0.5 text-xs ${kinds.includes('fav') ? 'bg-emerald-500 text-white ring-emerald-500' : 'bg-white text-stone-600 ring-emerald-200'}`}>
            ⭐ {t('Mes favoris')}
          </button>
          {PLACE_KINDS.map((k) => (
            <button type="button" key={k.id} onClick={() => toggle(k.id)}
              className={`chip px-2 py-0.5 text-xs ${kinds.includes(k.id) ? 'bg-teal-500 text-white ring-teal-500' : 'bg-white text-stone-600 ring-emerald-200'}`}>
              {k.emoji} {k.label}
            </button>
          ))}
        </div>
      )}
      {/* z-0 + isolate : les calques Leaflet (z-index 400 à 1000) restent sous la barre de navigation */}
      <div className={`${height} relative z-0 isolate overflow-hidden rounded-2xl ring-1 ring-emerald-100`}>
        <MapContainer center={view ? [view.lat, view.lng] : [start.lat, start.lng]} zoom={view ? view.zoom : center || markers.length ? zoom : 7}
          scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MyLocation />
          {stateKey && <ViewKeeper onChange={setSavedView} />}
          {onPick && <ClickToPick onPick={onPick} />}
          {picked && <Recenter center={picked} />}
          {picked && <Marker position={[picked.lat, picked.lng]} icon={pinIcon} />}
          {places && <PlacesLayer kinds={kinds} onChoose={onChoosePlace} onStatus={setStatus} onProposeRide={onProposeRide} onOpenPlace={onOpenPlace} />}
          {markers.map((m) => (
            <Marker key={m.id} position={[m.coords.lat, m.coords.lng]} icon={bubbleIcon(m)}>
              {m.popup && <Popup>{m.popup}</Popup>}
            </Marker>
          ))}
        </MapContainer>
      </div>
      {places && kinds.some((k) => k !== 'fav') && status && <p className="text-xs text-stone-500">{status}</p>}
    </div>
  );
}
