import { icon } from '../components/icons.js';
import { pageHead } from '../components/ui.js';
import { getTheme } from '../services/theme.js';
import { auth } from '../services/firebase.js';
import { state } from '../state/store.js';

const version = () => globalThis.CRICKET1_VERSION || 'dev';

export function renderSettings() {
  const theme = getTheme();
  const user = state.authUser || auth.currentUser;
  const syncStatus = state.cloudSyncStatus;

  return `${pageHead(
    'Preferences',
    'Settings',
    'Appearance, account and app preferences.'
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

    <!-- ScoreX Account -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3>ScoreX Account</h3>
          <div class="small">
            Signed in as ${user?.email || 'Google account'}
          </div>
        </div>

        <span class="chip">${syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'error' ? 'Sync error' : 'Synced'}</span>
      </div>

      <div class="hero-actions">
        <button
          type="button"
          class="secondary-btn"
          data-action="sign-out">
          Sign out
        </button>
      </div>

      <div class="small" style="margin-top:10px;">
        Your ScoreX account is connected to Firebase and is required to access the app.
      </div>
    </div>

    <!-- Cloud Storage -->
    <div class="card">
      <div class="card-header">
        <div>
          <h3>Cloud storage</h3>
          <div class="small">Your match data is linked to your ScoreX account.</div>
        </div>
        <span class="chip">Firebase</span>
      </div>
      <p class="small">
        Match data is saved to your private Firebase account. ScoreX may keep a temporary on-device cache after you sign in so scoring stays fast and resilient.
      </p>
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
