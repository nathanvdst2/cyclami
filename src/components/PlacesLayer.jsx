import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { t } from '../i18n/index.js';
import { useApp } from '../context/AppContext.jsx';
import { supabase } from '../lib/supabase.js';
import PlaceReviews from './PlaceReviews.jsx';

import { CELL, PLACE_KINDS, loadCell, useFavorites } from '../lib/places.js';

export { PLACE_KINDS };

const icon = (emoji) => L.divIcon({
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
  html: `<div style="width:28px;height:28px;border-radius:9999px;background:#fff;border:2px solid #fdba74;box-shadow:0 1px 4px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;font-size:15px">${emoji}</div>`,
});
const ICONS = Object.fromEntries(PLACE_KINDS.map((k) => [k.id, icon(k.emoji)]));
// lieu favori : même emoji, bordure dorée
const FAV_ICONS = Object.fromEntries(PLACE_KINDS.map((k) => [k.id, L.divIcon({
  className: '', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15],
  html: `<div style="width:30px;height:30px;border-radius:9999px;background:#fffbeb;border:3px solid #f59e0b;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:15px">${k.emoji}</div>`,
})]));


// Zones (centrées sur un multiple de 0,05°) qui touchent la partie visible de la carte, les plus proches
// du centre d'abord ; 30 au maximum (carte très dézoomée : le centre seulement).
function visibleCells(map) {
  const b = map.getBounds();
  const cells = [];
  for (let i = Math.round(b.getSouth() / CELL); i <= Math.round(b.getNorth() / CELL); i += 1) {
    for (let j = Math.round(b.getWest() / CELL); j <= Math.round(b.getEast() / CELL); j += 1) cells.push([i * CELL, j * CELL]);
  }
  const c = map.getCenter();
  return cells
    .sort((x, y) => Math.hypot(x[0] - c.lat, x[1] - c.lng) - Math.hypot(y[0] - c.lat, y[1] - c.lng))
    .slice(0, 30);
}

// Toujours monté avec la carte : précharge les lieux même avant qu'un filtre soit choisi.
// onOpenPlace : toucher un lieu ouvre sa page (sinon, une bulle s'affiche sur la carte)
export default function PlacesLayer({ kinds, onChoose, onStatus, onProposeRide, onOpenPlace }) {
  const [favs, toggleFav] = useFavorites();
  const favIds = new Set(favs.map((f) => f.place_id));
  const map = useMap();
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef(null);
  const generation = useRef(0);

  const load = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (map.getZoom() < 11) return;
      setLoading(true);
      const run = ++generation.current;
      const cells = visibleCells(map);
      const byId = new Map();
      let ok = 0;
      // 6 zones à la fois (le service interroge OpenStreetMap pour les zones pas encore en cache),
      // la carte se remplit au fur et à mesure en partant du centre
      const worker = async () => {
        while (cells.length && run === generation.current) {
          const [lat, lng] = cells.shift();
          try {
            (await loadCell(lat, lng)).forEach((x) => byId.set(x.id, x));
            ok += 1;
            if (run === generation.current) setAll([...byId.values()]);
          } catch { /* zone en échec : réessayée au prochain déplacement */ }
        }
      };
      await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
      if (run !== generation.current) return;
      setFailed(ok === 0);
      setLoading(false);
    }, 250);
  };
  useMapEvents({ moveend: load });
  useEffect(() => { load(); return () => clearTimeout(timer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!kinds.length) onStatus?.(null);
    else if (map.getZoom() < 11) onStatus?.(t('Zoome sur la carte pour voir les lieux.'));
    else if (loading && !all.length) onStatus?.(t('Chargement des lieux…'));
    else if (failed) onStatus?.(t('Lieux indisponibles pour le moment.'));
    else onStatus?.(null);
  }, [kinds.join(','), loading, failed, all.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // favoris affichés avec le filtre « Favoris », même hors des zones chargées
  const favPlaces = kinds.includes('fav')
    ? favs.map((f) => ({ id: f.place_id, kind: f.kind, name: f.name, lat: f.lat, lng: f.lng, phone: '', hours: '' }))
    : [];
  const places = [...favPlaces, ...all.filter((p) => kinds.includes(p.kind) && !(kinds.includes('fav') && favIds.has(p.id)))];

  // notes moyennes des lieux affichés (étoile dans la bulle)
  const [ratings, setRatings] = useState({});
  const [ratingsTick, setRatingsTick] = useState(0);
  const ids = places.map((p) => p.id).slice(0, 600).join(',');
  useEffect(() => {
    if (!ids) return;
    supabase.rpc('place_ratings', { p_ids: ids.split(',') }).then(({ data }) => {
      if (data) setRatings(Object.fromEntries(data.map((r) => [r.place_id, r])));
    }, () => {});
  }, [ids, ratingsTick]);

  return places.map((p) => {
    const kind = PLACE_KINDS.find((k) => k.id === p.kind) || PLACE_KINDS[1];
    const markerIcon = (favIds.has(p.id) ? FAV_ICONS : ICONS)[p.kind] || ICONS.park;
    // 1er toucher : petite bulle ; 2e toucher (sur la bulle) : page du lieu
    if (onOpenPlace) {
      return (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={markerIcon} title={p.name || kind.label}>
          <Popup>
            <button type="button" className="block w-full space-y-0.5 text-left text-sm" onClick={() => onOpenPlace(p)}>
              <span className="block font-bold">{kind.emoji} {p.name || kind.label}</span>
              <span className="block text-xs text-stone-500">
                {kind.label}
                {ratings[p.id] && <span className="ml-1 font-semibold text-emerald-500">★ {Number(ratings[p.id].average).toFixed(1)} ({ratings[p.id].total})</span>}
                {favIds.has(p.id) && ' · ★'}
              </span>
              <span className="block pt-1 font-semibold text-teal-600">{t('Voir le lieu →')}</span>
            </button>
          </Popup>
        </Marker>
      );
    }
    return (
      <Marker key={p.id} position={[p.lat, p.lng]} icon={markerIcon}>
        <Popup>
          <div className="space-y-1 text-sm">
            <div className="font-bold">
              {kind.emoji} {p.name || kind.label}
              {ratings[p.id] && <span className="ml-1 text-xs font-semibold text-emerald-500">★ {Number(ratings[p.id].average).toFixed(1)} ({ratings[p.id].total})</span>}
            </div>
            {p.hours && <div className="text-xs text-stone-500">{t('Horaires : {hours}', { hours: p.hours })}</div>}
            {p.phone && <a className="block text-xs text-teal-600" href={`tel:${p.phone}`}>{p.phone}</a>}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <button type="button" className="font-semibold text-emerald-600" onClick={() => toggleFav(p)}>
                {favIds.has(p.id) ? `★ ${t('Favori')}` : `☆ ${t('Ajouter aux favoris')}`}
              </button>
              {onProposeRide && (
                <button type="button" className="font-semibold text-teal-600" onClick={() => onProposeRide(p)}>🦮 {t('Proposer une sortie ici')}</button>
              )}
            </div>
            {onChoose && (
              <button type="button" className="font-semibold text-teal-600" onClick={() => onChoose(p)}>
                {t('Donner rendez-vous ici →')}
              </button>
            )}
            <PlaceReviews placeId={p.id} onRated={() => setRatingsTick((n) => n + 1)} />
          </div>
        </Popup>
      </Marker>
    );
  });
}
