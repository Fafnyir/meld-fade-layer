# Version 1.1 group fix validation

- 37 automated tests pass on Stream Deck’s bundled Node 24.13.1.
- New tests cover flattened group paths, nested folders, hidden-child preservation, opacity ratios, remembered membership after engine restart, reversal, overlapping keys, all-hidden initial groups, partial-state recovery, and hidden-folder errors.
- The live API returned `Cover Group` and flattened descendants such as `Cover Group/Name_Text.webm`, all typed as layers with the same scene parent.
- Off-air probes of folder `setProperty(visible)` and `toggleLayer` produced no visibility updates; each probe sent a restoration call. The fix therefore writes to descendants only.
- User confirmed version 1.0 works on actual layers. Version 1.1 group behavior still needs an installed key test: leave the folder on, show the desired children, select the `(group)` entry, fade out/in, and check that previously hidden children remain hidden. Also restart Stream Deck while faded out and verify the next press restores the remembered children.

The earlier validation record follows for provenance.

# Validation and acceptance testing

## Executed on September 28, 2026

- 28 automated tests passed under Node 24.19.0 and Stream Deck’s bundled Node 24.13.1.
- Tests cover exact fade endpoints, hide/restore ordering, configured opacity, easing, rapid reversals including initial reveal and hide-acknowledgement races, shared per-layer workers, independent layers, external visibility changes, missing/deleted layers, lost connections, failed writes, manual recovery, settings validation, hierarchy cycles, and catalog privacy.
- Protocol tests cover dynamic method/property discovery, request IDs, fractional opacity writes, idle acknowledgement, session replacement, timeout, unsupported API, reconnect and rejection of stale socket messages.
- Stream Deck event tests cover action appearance/settings, inspector data, shared key state, invalid settings and releasing unused connections.
- Manifest asset references and all runtime JavaScript syntax passed the local checker.
- Read-only connection using the completed client succeeded against Meld Studio 0.10.6.9 / API 3 with Stream Deck 7.5.1’s own Node 24.13.1 runtime. It discovered 6 scenes and 22 layers without changing them.
- A separate live `setProperty` capability test on an already-hidden layer changed opacity from 100% to 50%, confirmed in Meld’s inspector. The probe subsequently received an acknowledgement for restoring opacity to 1 (100%). Visibility was not changed by the probe. Because selection changed before the follow-up inspection, the restore was confirmed by API acknowledgement rather than a second inspector reading on the same layer.

See `VALIDATION.txt` for the final official CLI validation/package result.

## Still requires manual acceptance after installing

Do these checks while not streaming or recording. Use a simple test image or shape so changes are easy to see.

1. Install the included `.streamDeckPlugin`. Add **Meld Fade Layer → Fade Layer** to a key. Confirm the settings panel and scene/layer dropdowns appear.
2. Select a test layer with 100% opacity. With it visible, press once: verify a smooth 500 ms fade to hidden. Press again: verify a smooth fade to visible without a full-opacity flash.
3. Set both durations to 2000 ms. Press again halfway through each direction; verify continuous reversal, with no late hide at the end.
4. Set the layer and the action’s visible opacity to 60%. Verify fade in ends at 60% and fade out restores 60% while hidden.
5. Put the same layer on two keys; verify both reflect the completed state and either key can reverse a running fade. Put a different layer on another key; verify independent fades.
6. Hide/show the layer manually in Meld while idle; verify the key follows after session updates. Rename it; verify selection persists. Delete it; verify the action reports a missing layer rather than affecting a different one.
7. Close Meld during a fade. Verify the key shows offline, then reconnect after reopening. Use **Restore layer to visible** and verify it repairs intermediate opacity.
8. Test a nested layer with its parent visible, then hidden. Confirm the plugin does not override parent visibility.
9. For media/audio sources, check Meld’s visibility-triggered playback behavior. Audio should not be expected to fade with video.

Full physical Stream Deck key execution and rendered output animation have not been verified here. Windows installation/execution also needs a smoke test.
