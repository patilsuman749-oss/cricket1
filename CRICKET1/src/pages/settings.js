import { icon } from '../components/icons.js';
import { pageHead } from '../components/ui.js';
import { getTheme } from '../services/theme.js';

const flag = (key) => { try { return localStorage.getItem(key) !== 'off'; } catch { return true; } };
const version = () => globalThis.CRICKET1_VERSION || 'dev';

export function renderSettings() {
  const theme = getTheme();
  const toggle = (id, label, on) => `<label class="live-row setting-row" for="${id}"><span>${label}</span><input id="${id}" type="checkbox" ${on ? 'checked' : ''}></label>`;
  return `${pageHead('Preferences', 'Settings', 'Appearance, feedback and local data.')}
  <div class="grid grid-2">
    <div class="card"><div class="card-header"><div><h3>Theme</h3><div class="small">Light or dark scoreboard.</div></div><span class="chip">${theme === 'dark' ? 'Dark' : 'Light'}</span></div><div class="stepper"><button type="button" class="step-option ${theme === 'light' ? 'active' : ''}" data-theme-set="light" aria-pressed="${theme === 'light'}">${icon('sun', 16)} Light</button><button type="button" class="step-option ${theme === 'dark' ? 'active' : ''}" data-theme-set="dark" aria-pressed="${theme === 'dark'}">${icon('moon', 16)} Dark</button></div></div>
    <div class="card"><div class="card-header"><div><h3>Scoring feedback</h3><div class="small">Small sound and vibration cues.</div></div></div><div class="grid">${toggle('setting-sound', 'Sound effects', flag('cricket1-sound'))}${toggle('setting-vibration', 'Vibration', flag('cricket1-vibration'))}${toggle('setting-celebrations', 'Milestone animation', flag('cricket1-celebrations'))}</div></div>
    <div class="card"><div class="card-header"><div><h3>Data backup</h3><div class="small">Export every match or restore a JSON backup.</div></div></div><div class="hero-actions"><button type="button" class="secondary-btn" data-action="export">${icon('download', 15)} Export JSON</button><button type="button" class="secondary-btn" data-action="import">Import JSON</button><input id="import-file" type="file" accept="application/json,.json" hidden></div></div>
    <div class="card"><div class="card-header"><div><h3>Storage</h3><div class="small">Matches are saved only in this browser (IndexedDB).</div></div><span class="chip">Offline</span></div><p class="small">Cloud sync, Google login, live spectators and leaderboards are not part of this version; the data model is ready for them.</p><button type="button" class="danger-btn" data-action="clear-data">${icon('trash', 15)} Clear Local Data</button></div>
    <div class="card"><div class="card-header"><div><h3>App version</h3><div class="small">Updates install automatically; you will be asked to reload.</div></div><span class="chip">v${version()}</span></div><button type="button" class="secondary-btn" data-action="check-update">${icon('refresh', 15)} Check for updates</button></div>
  </div>`;
}
