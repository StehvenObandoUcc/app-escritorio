/**
 * Nombres legibles de apps a partir del nombre de proceso que guarda el sensor.
 * Solo cambia lo que se ve: los datos guardados y subidos conservan el nombre de proceso.
 */
const NAMES: Record<string, string> = {
  brave: 'Brave',
  chrome: 'Google Chrome',
  msedge: 'Microsoft Edge',
  firefox: 'Firefox',
  opera: 'Opera',
  code: 'VS Code',
  cursor: 'Cursor',
  explorer: 'Explorador de archivos',
  windowsterminal: 'Terminal',
  powershell: 'PowerShell',
  cmd: 'Símbolo del sistema',
  winword: 'Word',
  excel: 'Excel',
  powerpnt: 'PowerPoint',
  outlook: 'Outlook',
  olk: 'Outlook',
  'whatsapp.root': 'WhatsApp',
  whatsapp: 'WhatsApp',
  slack: 'Slack',
  'ms-teams': 'Microsoft Teams',
  teams: 'Microsoft Teams',
  discord: 'Discord',
  figma: 'Figma',
  notion: 'Notion',
  spotify: 'Spotify',
  searchhost: 'Búsqueda de Windows',
  snippingtool: 'Recortes',
  'docker desktop': 'Docker Desktop',
  pulso: 'Pulso',
  ollama: 'Ollama',
  'lm studio': 'LM Studio',
};

/** "brave" → "Brave"; un proceso desconocido se muestra tal cual, con la primera letra en mayúscula. */
export function displayAppName(appName: string): string {
  const known = NAMES[appName.trim().toLowerCase()];
  if (known) return known;
  return appName.charAt(0).toUpperCase() + appName.slice(1);
}

/** Sufijos que los navegadores y editores añaden al título de la ventana (Edge usa un espacio de ancho cero). */
const SUFFIX = /\s+[-–—]\s+(Brave|Google Chrome|Mozilla Firefox|Firefox|Microsoft\u200B? Edge|Opera|Visual Studio Code|Cursor)\s*$/i;

/** Quita el «- Brave» del final y descarta títulos que solo repiten el nombre de la app. */
export function cleanTitle(title: string | null, appName: string): string | null {
  if (!title) return null;
  const clean = title.replace(SUFFIX, '').trim();
  if (!clean || clean.toLowerCase() === displayAppName(appName).toLowerCase()) return null;
  return clean;
}
