# Pages

One module per screen. Each exports `renderX()` returning HTML (the live view also exports `bindLive`/`updateLive` for in-place updates). Pages never touch IndexedDB or the engine's mutators — `src/app.js` owns actions.

`setup-validation.js` is the pure state machine for New Match (step model, per-step validators, tagged errors); it has no DOM and is covered by `tests/setup-validation.test.mjs`.
