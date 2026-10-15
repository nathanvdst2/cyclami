// Caractéristiques techniques de l'appareil (aucune donnée personnelle) : envoyées une fois par jour,
// visibles seulement par les administrateurs (sécurité, comptes multiples, aide en cas de bug).
export function deviceInfo() {
  const n = navigator;
  const yes = (v) => (v ? 'oui' : 'non');
  return {
    userAgent: n.userAgent,
    platform: n.userAgentData?.platform || n.platform || '',
    screen: `${window.screen?.width}x${window.screen?.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    pixelRatio: String(window.devicePixelRatio || 1),
    language: n.language || '',
    languages: (n.languages || []).join(', '),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    standalone: yes(window.matchMedia?.('(display-mode: standalone)').matches || n.standalone),
    notifications: typeof Notification === 'undefined' ? 'non prises en charge' : Notification.permission,
    touch: yes(n.maxTouchPoints > 0),
    memory: n.deviceMemory ? `${n.deviceMemory} Go` : '',
    cores: n.hardwareConcurrency ? String(n.hardwareConcurrency) : '',
    connection: n.connection?.effectiveType || '',
    darkMode: yes(window.matchMedia?.('(prefers-color-scheme: dark)').matches),
  };
}

// « Android 14 · Samsung SM-S911B · Chrome 129 » à partir du user agent.
export function describeUserAgent(ua = '') {
  const pick = (re) => ua.match(re)?.[1];
  let os = '';
  if (/iPhone|iPad|iPod/.test(ua)) os = `${/iPad/.test(ua) ? 'iPadOS' : 'iOS'} ${(pick(/OS (\d+[_.]\d+)/) || '').replace('_', '.')}`;
  else if (/Android/.test(ua)) os = `Android ${pick(/Android ([\d.]+)/) || ''}`;
  else if (/Windows NT/.test(ua)) os = `Windows ${({ '10.0': '10/11', '6.3': '8.1', '6.1': '7' })[pick(/Windows NT ([\d.]+)/)] || ''}`;
  else if (/Mac OS X/.test(ua)) os = `macOS ${(pick(/Mac OS X ([\d_]+)/) || '').replace(/_/g, '.')}`;
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  const model = /Android/.test(ua) ? pick(/Android [\d.]+; (?:[a-z]{2}-[a-z]{2}; )?([^;)]+?)(?: Build|\))/i) : /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : '';
  const browser = [[/EdgA?\/([\d]+)/, 'Edge'], [/SamsungBrowser\/([\d]+)/, 'Samsung Internet'], [/OPR\/([\d]+)/, 'Opera'],
    [/Firefox\/([\d]+)/, 'Firefox'], [/FxiOS\/([\d]+)/, 'Firefox'], [/CriOS\/([\d]+)/, 'Chrome'], [/Chrome\/([\d]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari/, 'Safari']].map(([re, name]) => (re.test(ua) ? `${name} ${pick(re)}` : null)).find(Boolean) || '';
  return [os.trim(), model && model !== 'K' ? model.trim() : '', browser].filter(Boolean).join(' · ') || ua.slice(0, 80) || '?';
}
