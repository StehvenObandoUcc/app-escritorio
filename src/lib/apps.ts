import { t } from '@/i18n';

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
  get explorer() {
    return t('apps.explorer');
  },
  windowsterminal: 'Terminal',
  powershell: 'PowerShell',
  get cmd() {
    return t('apps.cmd');
  },
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
  get searchhost() {
    return t('apps.searchhost');
  },
  get snippingtool() {
    return t('apps.snippingtool');
  },
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

/** Nombre con el que el sensor guarda una app oculta (AC-20). */
export const HIDDEN_APP = 'App oculta';

/** Clases de color de la paleta de apps (tokens `bg-app-1` … `bg-app-8`). */
const APP_COLORS = ['bg-app-1', 'bg-app-2', 'bg-app-3', 'bg-app-4', 'bg-app-5', 'bg-app-6', 'bg-app-7', 'bg-app-8'];

/**
 * Color de una app: siempre el mismo para el mismo nombre (de un día a otro). Las apps ocultas usan el
 * gris neutro: no tienen nombre que distinguir.
 */
export function appColor(appName: string): string {
  if (appName === HIDDEN_APP) return 'bg-cat-neutral';
  let hash = 0;
  for (const ch of appName.trim().toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return APP_COLORS[hash % APP_COLORS.length]!;
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
