/** Sound + vibration. One lazily created AudioContext, reused for every beep. */
const flag = (key) => { try { return localStorage.getItem(key) !== 'off'; } catch { return true; } };

export function vibrate(kind = 'small') {
  if (!flag('cricket1-vibration')) return;
  try { navigator.vibrate?.(kind === 'wicket' ? [35, 25, 65] : kind === 'over' ? [30] : [12]); } catch { /* unsupported */ }
}

export function celebrate() {
  if (!flag('cricket1-celebrations')) return;
  try { document.documentElement.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.012)' }, { transform: 'scale(1)' }], { duration: 360, easing: 'ease-out' }); } catch { /* ignore */ }
}

let ctx = null, gain = null;
const FREQ = { run: 390, over: 520, wicket: 210 };

/** Call from a user gesture once (first tap) so later beeps are instant. */
export function primeAudio() {
  if (ctx || !flag('cricket1-sound')) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  try { ctx = new Ctx(); gain = ctx.createGain(); gain.gain.value = 0.028; gain.connect(ctx.destination); } catch { ctx = null; }
}

export function playFeedback(type = 'run') {
  if (!flag('cricket1-sound')) return;
  try {
    primeAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = FREQ[type] || FREQ.run;
    osc.connect(gain); osc.start(); osc.stop(ctx.currentTime + 0.05);
  } catch { /* audio is optional */ }
}
