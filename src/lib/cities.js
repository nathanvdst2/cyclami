// Grandes villes de Belgique et de France : pages publiques « Sorties et rencontres entre chiens à … »
// (/sorties/<ville>) et « Animaux perdus à … » (/perdus/<ville>). Aussi utilisé par le serveur
// (netlify/edge-functions/share.js). L'adresse reste la même dans les trois langues, seul le nom change.
// [adresse, nom en français, nom en néerlandais, nom en anglais, latitude, longitude, pays]
const LIST = [
  ['bruxelles', 'Bruxelles', 'Brussel', 'Brussels', 50.8467, 4.3525, 'BE'],
  ['anvers', 'Anvers', 'Antwerpen', 'Antwerp', 51.2194, 4.4025, 'BE'],
  ['gand', 'Gand', 'Gent', 'Ghent', 51.0543, 3.7174, 'BE'],
  ['charleroi', 'Charleroi', 'Charleroi', 'Charleroi', 50.4108, 4.4446, 'BE'],
  ['liege', 'Liège', 'Luik', 'Liège', 50.6326, 5.5797, 'BE'],
  ['bruges', 'Bruges', 'Brugge', 'Bruges', 51.2093, 3.2247, 'BE'],
  ['namur', 'Namur', 'Namen', 'Namur', 50.4674, 4.8718, 'BE'],
  ['louvain', 'Louvain', 'Leuven', 'Leuven', 50.8798, 4.7005, 'BE'],
  ['mons', 'Mons', 'Bergen', 'Mons', 50.4542, 3.9567, 'BE'],
  ['malines', 'Malines', 'Mechelen', 'Mechelen', 51.0259, 4.4776, 'BE'],
  ['alost', 'Alost', 'Aalst', 'Aalst', 50.9378, 4.0403, 'BE'],
  ['hasselt', 'Hasselt', 'Hasselt', 'Hasselt', 50.9307, 5.3325, 'BE'],
  ['courtrai', 'Courtrai', 'Kortrijk', 'Kortrijk', 50.8280, 3.2649, 'BE'],
  ['ostende', 'Ostende', 'Oostende', 'Ostend', 51.2300, 2.9200, 'BE'],
  ['tournai', 'Tournai', 'Doornik', 'Tournai', 50.6056, 3.3878, 'BE'],
  ['wavre', 'Wavre', 'Waver', 'Wavre', 50.7167, 4.6000, 'BE'],
  ['louvain-la-neuve', 'Louvain-la-Neuve', 'Louvain-la-Neuve', 'Louvain-la-Neuve', 50.6681, 4.6118, 'BE'],
  ['nivelles', 'Nivelles', 'Nijvel', 'Nivelles', 50.5978, 4.3286, 'BE'],
  ['verviers', 'Verviers', 'Verviers', 'Verviers', 50.5891, 5.8627, 'BE'],
  ['arlon', 'Arlon', 'Aarlen', 'Arlon', 49.6833, 5.8167, 'BE'],
  ['paris', 'Paris', 'Parijs', 'Paris', 48.8566, 2.3522, 'FR'],
  ['marseille', 'Marseille', 'Marseille', 'Marseille', 43.2965, 5.3698, 'FR'],
  ['lyon', 'Lyon', 'Lyon', 'Lyon', 45.7640, 4.8357, 'FR'],
  ['toulouse', 'Toulouse', 'Toulouse', 'Toulouse', 43.6047, 1.4442, 'FR'],
  ['nice', 'Nice', 'Nice', 'Nice', 43.7102, 7.2620, 'FR'],
  ['nantes', 'Nantes', 'Nantes', 'Nantes', 47.2184, -1.5536, 'FR'],
  ['montpellier', 'Montpellier', 'Montpellier', 'Montpellier', 43.6108, 3.8767, 'FR'],
  ['strasbourg', 'Strasbourg', 'Straatsburg', 'Strasbourg', 48.5734, 7.7521, 'FR'],
  ['bordeaux', 'Bordeaux', 'Bordeaux', 'Bordeaux', 44.8378, -0.5792, 'FR'],
  ['lille', 'Lille', 'Rijsel', 'Lille', 50.6292, 3.0573, 'FR'],
  ['rennes', 'Rennes', 'Rennes', 'Rennes', 48.1173, -1.6778, 'FR'],
  ['reims', 'Reims', 'Reims', 'Reims', 49.2583, 4.0317, 'FR'],
  ['toulon', 'Toulon', 'Toulon', 'Toulon', 43.1242, 5.9280, 'FR'],
  ['grenoble', 'Grenoble', 'Grenoble', 'Grenoble', 45.1885, 5.7245, 'FR'],
  ['dijon', 'Dijon', 'Dijon', 'Dijon', 47.3220, 5.0415, 'FR'],
  ['angers', 'Angers', 'Angers', 'Angers', 47.4784, -0.5632, 'FR'],
  ['nimes', 'Nîmes', 'Nîmes', 'Nîmes', 43.8367, 4.3601, 'FR'],
  ['clermont-ferrand', 'Clermont-Ferrand', 'Clermont-Ferrand', 'Clermont-Ferrand', 45.7772, 3.0870, 'FR'],
  ['le-havre', 'Le Havre', 'Le Havre', 'Le Havre', 49.4944, 0.1079, 'FR'],
  ['tours', 'Tours', 'Tours', 'Tours', 47.3941, 0.6848, 'FR'],
  ['rouen', 'Rouen', 'Rouen', 'Rouen', 49.4432, 1.0999, 'FR'],
  ['caen', 'Caen', 'Caen', 'Caen', 49.1829, -0.3707, 'FR'],
  ['metz', 'Metz', 'Metz', 'Metz', 49.1193, 6.1757, 'FR'],
  ['nancy', 'Nancy', 'Nancy', 'Nancy', 48.6921, 6.1844, 'FR'],
  ['amiens', 'Amiens', 'Amiens', 'Amiens', 49.8941, 2.2958, 'FR'],
  ['valenciennes', 'Valenciennes', 'Valenciennes', 'Valenciennes', 50.3570, 3.5235, 'FR'],
];

export const CITIES = LIST.map(([slug, fr, nl, en, lat, lng, country]) => ({ slug, name: { fr, nl, en }, lat, lng, country }));
export const cityBySlug = (slug) => CITIES.find((c) => c.slug === slug) || null;

// Rayon des pages par ville (km) : la ville et ses environs.
export const CITY_RADIUS_KM = 15;

const km = (a, b) => {
  const r = Math.PI / 180;
  const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r);
  const y = (b.lat - a.lat) * r;
  return 6371 * Math.hypot(x, y);
};

// Ville la plus proche d'un point (dans le rayon), sinon null.
export function nearestCity(p) {
  if (p?.lat == null || p?.lng == null) return null;
  let best = null;
  let d = Infinity;
  for (const c of CITIES) {
    const dc = km(p, c);
    if (dc < d) { d = dc; best = c; }
  }
  return d <= CITY_RADIUS_KM ? best : null;
}

// Villes voisines (même pays, les plus proches), pour les liens entre pages.
export const nearbyCities = (city, n = 6) => CITIES.filter((c) => c !== city && c.country === city.country)
  .sort((a, b) => km(city, a) - km(city, b)).slice(0, n);
