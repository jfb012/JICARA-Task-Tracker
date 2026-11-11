// Constantes y utilidades
export const TZ = 'America/Costa_Rica';
export const STATUSES = ['Pendiente', 'En proceso', 'En espera', 'Terminado'];
export const STATUS_VAR = {
  'Pendiente': 'var(--status-pendiente)',
  'En proceso': 'var(--status-proceso)',
  'En espera': 'var(--status-espera)',
  'Terminado': 'var(--status-terminado)'
};
export const ASSIGNEES = ['Julian', 'Matteo', 'Ambos'];
export const PRIORITIES = ['Alta', 'Normal'];
export const ARCHIVE_DAYS = 7;

export const SEED_SUBJECTS = [
  ['Proveedor (Cyril / Choose Planet A)', '#7c3aed'],
  ['Legal y Contratos', '#0f766e'],
  ['Finanzas y Presupuesto', '#4338ca'],
  ['Ventas y Prospectos', '#db2777'],
  ['Logística e Importación', '#92400e'],
  ['Marketing y Marca', '#0891b2'],
  ['Reuniones', '#65a30d'],
  ['Administración y Sistemas', '#475569']
];

const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const shortFmt = new Intl.DateTimeFormat('es', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });

/** Fecha de hoy en Costa Rica, 'YYYY-MM-DD' */
export const todayYMD = () => ymdFmt.format(new Date());
/** 'YYYY-MM-DD' + n días → 'YYYY-MM-DD' */
export function addDaysYMD(ymd, n) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Date/Timestamp → 'YYYY-MM-DD' en Costa Rica */
export const toYMD = (d) => d ? ymdFmt.format(toDate(d)) : '';
export const toDate = (v) => !v ? null : (v.toDate ? v.toDate() : (v instanceof Date ? v : new Date(v)));
/** 'YYYY-MM-DD' → Date al mediodía de Costa Rica (UTC-6) */
export const ymdToDate = (ymd) => ymd ? new Date(ymd + 'T12:00:00-06:00') : null;

/** "vie 14 nov" */
export function fmtShort(v) {
  const d = typeof v === 'string' ? ymdToDate(v) : toDate(v);
  if (!d || isNaN(d)) return '';
  const p = Object.fromEntries(shortFmt.formatToParts(d).map((x) => [x.type, x.value]));
  const clean = (s) => (s || '').replace(/\./g, '');
  return `${clean(p.weekday)} ${p.day} ${clean(p.month)}`;
}

export const isOverdue = (t) => !!t.dueDate && t.status !== 'Terminado' && t.dueDate < todayYMD();

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
