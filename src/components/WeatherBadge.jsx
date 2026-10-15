import { useEffect, useState } from 'react';
import { t } from '../i18n/index.js';
import { weatherAt } from '../lib/weather.js';

// Prévision au point de départ, chargée en arrière-plan (null tant qu'on ne sait pas)
export function useWeather(coords, date) {
  const [meteo, setMeteo] = useState(null);
  const lat = coords?.lat;
  const lng = coords?.lng;
  useEffect(() => {
    let alive = true;
    setMeteo(null);
    if (lat == null || lng == null) return undefined;
    weatherAt(lat, lng, date).then((m) => { if (alive) setMeteo(m); }, () => {});
    return () => { alive = false; };
  }, [lat, lng, date]);
  return meteo;
}

// Conseils selon la météo prévue
function hints(m) {
  const out = [];
  if (m.rain >= 60) out.push(t('Pense à ta veste de pluie 🧥'));
  if (m.gusts >= 50) out.push(t('Rafales fortes : prudence à découvert et dans les descentes.'));
  if (m.temp <= 2) out.push(t('Il peut geler : attention au verglas 🧊'));
  if (m.temp >= 30) out.push(t('Forte chaleur : emporte de l’eau en plus 💧'));
  return out;
}

// Météo et vent au départ : « ☀️ 14° · 💧 10% » et « 💨 18 km/h NO, rafales 35 »
export default function WeatherBadge({ coords, date }) {
  const m = useWeather(coords, date);
  if (!m) return null;
  const dir = m.windDir ? t(m.windDir) : '';
  const tips = hints(m);
  return (
    <>
      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800" title={t('Météo prévue au départ')}>
        {m.emoji} {m.temp}°{m.rain != null && ` · 💧 ${m.rain}%`}
      </span>
      {m.wind != null && (
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800" title={t('Vent prévu au départ')}>
          {m.gusts != null && m.gusts > m.wind
            ? t('💨 {speed} km/h {dir}, rafales {gusts}', { speed: m.wind, dir, gusts: m.gusts })
            : t('💨 {speed} km/h {dir}', { speed: m.wind, dir })}
        </span>
      )}
      {tips.length > 0 && <span className="basis-full text-xs text-sky-700">{tips.join(' · ')}</span>}
    </>
  );
}
