# Meld Fade Layer

A custom Stream Deck action that smoothly fades a selected Meld Studio layer or group’s contents in or out. Press the same key again during a fade to reverse direction from its current opacity.

The plugin identifier is **`com.fafnyir.meldfade`** and its folder is **`com.fafnyir.meldfade.sdPlugin`**. This is a new identity relative to the earlier `com.fpatten` build: after installing, add the new action to your keys and select your layers/groups again. Old key assignments and remembered group membership do not migrate automatically.

## Install and try it

1. Use **Stream Deck 7.5 or later** on macOS 13+ or Windows 10+. The plugin uses Stream Deck’s included Node.js 24 runtime; you do not need to install Node, npm, or any libraries to use it.
2. Open **`dist/com.fafnyir.meldfade.streamDeckPlugin`** and accept Stream Deck’s installation prompt.
3. Open Meld Studio. Under **Settings → Advanced**, enable **WebSocket Server** if it is not already enabled.
4. In Stream Deck’s action list, find **Meld Fade Layer → Fade Layer** and drag it onto a key.
5. Select a **Scene**, then a **Layer** in the key’s settings. The selection is saved by ID, so duplicate names and renaming are supported. It controls that saved layer, not whatever is selected in Meld’s inspector.
6. Start with **500 ms** fade in/out, **Smooth ease in / out**, **100% visible opacity**, and **30 fps**.
7. While offline from streaming/recording, press the key. A visible layer fades out; a hidden layer fades in. Press again halfway through a longer fade to check reversal.

The key shows **ON**, **OFF**, **FADING IN**, or **FADING OUT**. **SETUP**, **OFFLINE**, or an alert indicates a configuration/connection problem; select the key to see the explanation.

Your installed Meld **0.10.6.9 (API 3)** was checked during development. Its `setProperty(layerId, "opacity", 0.5)` call was visually confirmed to set a hidden layer’s inspector to **50%**. A restoration call set it back to `1` (100%). The finished client also connected using Stream Deck **7.5.1**’s bundled Node **24.13.1**. The packaged action still needs an end-to-end key test after installation; it has not been added to or tested on your physical Stream Deck. Windows has not been tested locally.

## Group folders — new in 1.1

Select the entry ending in **(group)**. Keep the folder visible in Meld and initially show the children you want included. The first press fades those visible children out together; the next restores only those children. Already-hidden children remain hidden. The remembered membership is saved in Stream Deck’s global plugin settings and survives restart.

Meld 0.10.6.9 exposes group membership through names such as `Cover Group/Name_Text.webm`, while retaining the scene as the parent. The plugin detects that path structure (including nested groups) and animates the leaf layers. Neither property writes nor `toggleLayer` produced a group visibility update in the local probe, so **the folder eye stays on**. ON/OFF on the key describes the group’s contents.

- If the folder is hidden, show it in Meld first. If all children are hidden and the plugin has no remembered membership, it asks you to show the desired children rather than guessing.
- If a group’s descendants are renamed, moved, or deleted, recheck the selection and contents. An empty group has no descendants for the API to identify and nothing to fade.
- Group detection depends on slash-separated names because this API has no explicit folder type. Avoid naming unrelated layers as though they were paths underneath a folder.
- Opacity readback is still absent in this Meld version. Group members use **Visible opacity** as their normal level; match this setting to their opacity. Mixed per-child opacities cannot be recovered automatically when Meld omits them. Numeric opacity readback, when available, is preserved per child.
- Child/group keys that overlap an active group animation are blocked until it finishes. The same group key still reverses normally.
- This fades each child separately; overlapping translucent children may blend differently from a single composited folder-opacity fade.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| Scene / Layer | Choose on first use | A fixed layer in a fixed scene. Nested layers are supported when their ancestry is present in the API. |
| Fade in / out | 500 / 500 ms | Independent durations, 50–10,000 ms. |
| Motion | Smooth | Smoothstep easing, or a constant linear fade. |
| Visible opacity | 100% | The layer’s normal on-state opacity, 1–100%. |
| Address | `ws://127.0.0.1:13376` | Meld’s local WebChannel endpoint. Remote `ws://`/`wss://` endpoints can be entered. |
| Update rate | 30 fps | 15, 30, or 60 requested updates per second. Actual rate depends on response time. |
| Restore layer to visible | Manual recovery | Immediately sets the selected layer to the configured visible opacity and shows it. |

Settings save when you change a field. Changes during an existing fade take effect on the next press. Multiple keys for the same address/layer share one animation; a press on either reverses it. Use matching opacity settings on those keys.

## How it works

The plugin connects directly to Meld’s Qt WebChannel server over WebSocket. It discovers the `meld` object’s method/property indices during initialization and consumes session updates with the required idle acknowledgements. There is no OBS bridge, hotkey simulation, separate server, or dependency on Meld’s official Stream Deck plugin. Both plugins may coexist.

For a fade in, the plugin sets opacity to zero **before** making the layer visible, then animates opacity to the configured visible level. For a fade out, it animates to zero, hides the layer, and restores its configured opacity while hidden. A later manual visibility change therefore shows the layer normally. The opacity API uses fractions from **0 to 1**, while the inspector presents percentages.

Animations use elapsed time and acknowledged, serial writes. They never build an unbounded queue of frames. Rapid presses change the active animation’s target rather than starting competing loops. On reversal, duration scales with the remaining opacity distance. Different layers can animate independently.

## Important behavior and limits

- **Opacity readback:** Meld 0.10.6.9 omits opacity from its session data even though opacity writes work. Set **Visible opacity** to the layer’s normal opacity in Meld (for example, 65%). On the first fade out, the plugin must assume that configured starting level. Manual opacity edits are not automatically detected on this version. If a future API reports a numeric 0–1 opacity, it is used as the starting value.
- **Video only:** This action fades the layer’s picture. It does not fade audio gain. Hiding a layer may trigger Meld’s own media/playback behavior.
- **Parent visibility:** A layer inside a hidden group or an inactive scene may not appear on the output even though its own visibility is on. The plugin does not switch scenes or reveal parent groups.
- **During a fade:** The plugin owns this layer’s opacity/visibility until the animation finishes. Avoid simultaneously changing those properties manually or from another integration.
- **Disconnect/crash:** An interrupted fade can leave intermediate opacity. Reconnection does not automatically resume old animations. After reconnecting, use **Connection & recovery → Restore layer to visible**, or set opacity and visibility manually in Meld. This intentionally makes the layer visible.
- **External toggles:** Button state follows Meld’s visibility updates. For 1.5 seconds after a completed fade, the plugin prefers its just-completed state to avoid stale session updates causing a wrong immediate toggle.
- **API support:** Meld must expose `setProperty` (introduced in API 2). Opacity behavior was verified on 0.10.6.9 / API 3; older versions with `setProperty` have not been verified. A successful generic method acknowledgement is not an opacity readback guarantee.
- **Key actions only:** Dials and Stream Deck Multi Actions are intentionally not exposed; toggle/reversal depends on actual layer state.
- **Local by default:** All operational traffic is between Stream Deck and the configured Meld endpoint. There is no telemetry or cloud service. Do not expose Meld’s unauthenticated WebSocket server to the public internet.

## Troubleshooting

**Offline / cannot connect:** Keep Meld running, check its WebSocket Server setting, and leave the default address when both programs run on this computer. The plugin retries every second. For a remote computer, use its reachable address and configure network access appropriately.

**Scene or layer missing:** Open the right Meld session, click **Refresh layers**, and reselect the scene/layer. Deleted and recreated layers have different IDs. The plugin will not silently substitute another layer with the same name.

**Visible but not showing:** Check that the selected scene is on the output, parent groups are visible, the layer has content, and the configured opacity is correct.

**Jump at the start of fade out:** Set **Visible opacity** to match the layer’s opacity in Meld. If a prior fade was interrupted, restore the layer first.

**Choppy fade:** Try 30 or 15 fps and a longer duration. The setting is an upper bound, not a promise of output frame synchronization.

**Plugin not listed:** Check Stream Deck is 7.5+, restart it, and reinstall the `.streamDeckPlugin` file. This is a personal plugin, not a Marketplace-published product.

**Recovery:** The Restore button is deliberately immediate. Use it off-air when an immediate appearance would be distracting.

## Source and development

```text
com.fafnyir.meldfade.sdPlugin/
  manifest.json            Stream Deck plugin/action configuration
  src/plugin.cjs           Stream Deck registration, events, state, connection sharing
  src/meld.cjs             WebSocket / Qt WebChannel client
  src/fade.cjs             Animation and reversal engine
  src/config.cjs           Defaults, validation, layer hierarchy
  ui/                      Property inspector
  images/                  Original icons at standard and 2x resolutions
test/                      Automated behavior/protocol/integration tests
tools/                     Read-only diagnostic, checks, icon and source ZIP builders
docs/TESTING.md             Validation record and manual acceptance checklist
dist/                      Native installer, source ZIP and SHA-256 checksums
```

The `.sdPlugin` directory is the complete runtime project. Source runs directly; no transpilation, bundle step, or runtime dependencies are required. Use Node 24+ for development:

```sh
node --test test/*.test.cjs
node tools/check.cjs
node tools/diagnose.cjs
```

`diagnose.cjs` only reads API metadata and counts, never changes a layer, and never prints session media paths or browser-source URLs. An optional first argument changes the endpoint.

To validate and build an installer with Elgato’s official CLI:

```sh
npx --yes @elgato/cli validate com.fafnyir.meldfade.sdPlugin
npx --yes @elgato/cli pack com.fafnyir.meldfade.sdPlugin --output dist
```

Add `--force` to `pack` when intentionally replacing an existing installer. Rebuild the source ZIP with `python3 tools/package.py`. Icons are included; regenerating them requires Python 3 and Pillow (`python3 tools/icons.py`).

For direct development installation, Elgato’s CLI also supports `streamdeck link com.fafnyir.meldfade.sdPlugin`. Normal users should use the included installer.

## References

- [Meld WebChannel API](https://github.com/MeldStudio/streamdeck/blob/main/WebChannelAPI.md) — protocol, session hierarchy, `setProperty`, and port 13376.
- [Meld WebSocket settings](https://meldstudio.co/docs/settings/#websocket-server).
- [Stream Deck manifest](https://docs.elgato.com/streamdeck/sdk/references/manifest/) and [property inspector WebSocket API](https://docs.elgato.com/streamdeck/sdk/v2/references/websocket/ui/).
- [Elgato CLI validation](https://docs.elgato.com/streamdeck/cli/commands/validate/) and [packaging](https://docs.elgato.com/streamdeck/cli/commands/pack/).

MIT licensed. The Qt protocol implementation here is original; Qt’s `qwebchannel.js` is not bundled. This personal plugin is not affiliated with or endorsed by Meld Studio or Elgato.
