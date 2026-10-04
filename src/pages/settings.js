import { icon } from '../components/icons.js';
import { pageHead } from '../components/ui.js';
import { getTheme } from '../services/theme.js';
import { auth } from '../services/firebase.js';
import { state } from '../state/store.js';

const flag = (key) => {
  try {
    return localStorage.getItem(key) !== 'off';
  } catch {
    return true;
  }
};

const version = () => globalThis.CRICKET1_VERSION || 'dev';

export function renderSettings() {
  const theme = getTheme();
  const user = state.authUser || auth.currentUser;
  const syncStatus = state.cloudSyncStatus;

  const toggle = (id, label, on) =>
    `<label class="live-row setting-row" for="${id}">
      <span>${label}</span>
      <input id="${id}" type="checkbox" ${on ? 'checked' : ''}>
    </label>`;

  return `${pageHead(
    'Preferences',
    'Settings',
    'Appearance, account, feedback and local data.'
  )}

  <div class="grid grid-2">

    <!-- Theme -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3>Theme</h3>
          <div class="small">Light or dark scoreboard.</div>
        </div>
        <span class="chip">${theme === 'dark' ? 'Dark' : 'Light'}</span>
      </div>

      <div class="stepper">
        <button
          type="button"
          class="step-option ${theme === 'light' ? 'active' : ''}"
          data-theme-set="light"
          aria-pressed="${theme === 'light'}">
          ${icon('sun', 16)} Light
        </button>

        <button
          type="button"
          class="step-option ${theme === 'dark' ? 'active' : ''}"
          data-theme-set="dark"
          aria-pressed="${theme === 'dark'}">
          ${icon('moon', 16)} Dark
        </button>
      </div>
    </div>

    <!-- Scoring Feedback -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3>Scoring feedback</h3>
          <div class="small">Small sound and vibration cues.</div>
        </div>
      </div>

      <div class="grid">
        ${toggle(
          'setting-sound',
          'Sound effects',
          flag('cricket1-sound')
        )}

        ${toggle(
          'setting-vibration',
          'Vibration',
          flag('cricket1-vibration')
        )}

        ${toggle(
          'setting-celebrations',
          'Milestone animation',
          flag('cricket1-celebrations')
        )}
      </div>
    </div>

    <!-- ScoreX Account -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3>ScoreX Account</h3>

          <div class="small">
            ${
              user
                ? `Signed in as ${user.email || 'Google account'}`
                : 'Sign in to sync your matches with the cloud.'
            }
          </div>
        </div>

        <span class="chip">
          ${user ? (syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'error' ? 'Sync error' : 'Synced') : 'Guest'}
        </span>
      </div>

      <div class="hero-actions">

        ${
          user
            ? `<button
                type="button"
                class="secondary-btn"
                data-action="sign-out">
                Sign out
              </button>`
            : `<button
                type="button"
                class="secondary-btn"
                data-action="sign-in">
                ${icon('users', 15)} Sign in with Google
              </button>`
        }

      </div>

      <div class="small" style="margin-top:10px;">
        ${
          user
            ? 'Your ScoreX account is connected to Firebase. Matches sync automatically when online.'
            : 'You can continue using ScoreX locally without signing in.'
        }
      </div>
    </div>

    <!-- Data Backup -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3>Data backup</h3>
          <div class="small">
            Export every match or restore a JSON backup.
          </div>
        </div>
      </div>

      <div class="hero-actions">
        <button
          type="button"
          class="secondary-btn"
          data-action="export">
          ${icon('download', 15)} Export JSON
        </button>

        <button
          type="button"
          class="secondary-btn"
          data-action="import">
          Import JSON
        </button>

        <input
          id="import-file"
          type="file"
          accept="application/json,.json"
          hidden>
      </div>
    </div>

    <!-- Storage -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3>Storage</h3>
          <div class="small">
            Local matches are saved in this browser.
          </div>
        </div>

        <span class="chip">Local</span>
      </div>

      <p class="small">
        ScoreX keeps local data available even when you are offline.
        Cloud match syncing uses Firebase when your account is connected.
      </p>

      <button
        type="button"
        class="danger-btn"
        data-action="clear-data">
        ${icon('trash', 15)} Clear Local Data
      </button>
    </div>

    <!-- App Version -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3>App version</h3>
          <div class="small">
            Updates install automatically; you will be asked to reload.
          </div>
        </div>

        <span class="chip">v${version()}</span>
      </div>

      <button
        type="button"
        class="secondary-btn"
        data-action="check-update">
        ${icon('refresh', 15)} Check for updates
      </button>
    </div>

  </div>`;
}