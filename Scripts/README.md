# Developer documentation
Learn more on how to write GeoFS Addons in [this short manual](GeoFS.md).

## Addon architecture (Option A)
New addon development lives in [addon](addon), with a simplified reusable structure:

- Shared runtime: [addon/core/runtime.js](addon/core/runtime.js)
- Generic modules: [addon/modules](addon/modules)
- Shared defaults/presets: [addon/defaults](addon/defaults)
- Aircraft plugins: [addon/aircrafts](addon/aircrafts)
  - Base class: [addon/aircrafts/BasePlugin.js](addon/aircrafts/BasePlugin.js)
  - F-18 plugin: [addon/aircrafts/F18MainPlugin.js](addon/aircrafts/F18MainPlugin.js)
- Userscript entrypoints: [addon/entrypoints](addon/entrypoints)
  - F-18 entrypoint: [addon/entrypoints/geo-fs-f18-addon.user.js](addon/entrypoints/geo-fs-f18-addon.user.js)

The F-18 entrypoint uses `@require` to load:

1. shared runtime
2. generic modules + defaults
3. `BasePlugin`
4. aircraft main plugin

This keeps installation simple for external plugin developers: they can publish one entrypoint userscript and compose modules with `@require`.

### Current F-18 storage keys
- Options: `F18Options`
- Weapons: `F18WpnState`

### Semver
- Shared core version is exposed as `window.GeoFSAddonCore.version`.
- Aircraft modules declare their own plugin version and required core version.

### Active addon resolution
- Use `window.BasePlugin.getActiveAddon()` to access the active aircraft addon at runtime.
- This replaces aircraft-specific addon globals in shared scripts and integrations.

## Aircraft Builder (Tampermonkey)
Use [geo-fs-aircraft-builder.js](geo-fs-aircraft-builder.js) as a standalone builder plugin.

It supports:
- Start empty or paste/read an existing `MainPlugin.js`
- Read and edit `AIRCRAFT_ID` and `DEFAULT_MFD_LAYOUT`
- Add/select MFD slots
- Adjust `position`, `rotation`, `scale` with +/- buttons
- Configure step sizes for position/rotation/scale
- Live apply transform updates to the active addon (`window.BasePlugin.getActiveAddon().mfd`)
- Generate and download a `MainPlugin.js` and entrypoint userscript

## F-18 Addon
The main F-18 Addon will be updated from time to time with new functionality. Unless you want to directly contribute to the plugin, it's best to customize it with your own Tampermonkey script. [This script](geo-fs-f18-mod-flightplan.js) is an example on how to add checklists, briefings and a custom IFF Codebook to the F-18.

## Mission Planner (Tampermonkey)
Use [geo-fs-mission-planner.user.js](geo-fs-mission-planner.user.js) for mission authoring directly on the GeoFS map.

### Public API
The script exposes:

```js
window.GeoFSMissionPlanner
```

Current shape:

```js
{
  version: '0.2.0',
  app
}
```

The app contains these domain modules:
- `app.store` (mission persistence and mission model)
- `app.map` (map rendering + navaid popup integration)
- `app.tools` (drawing tools: polygon, square, circle)

Mission section supports these grouped fields:
- `Mission`: name, `group`, `flight`, `wingman`
- `Flight`: `startTimeZ`, `startTaxiZ`, `startToZ`, `timeOverTargetZ`, `endTimeZ`
- `Positions`: dynamic list of callsigns (`#1`, `#2`, ...)
- `Cruise`: `altitude`, `speed`, `notes`
- `Landing`: `airportIcao`, `runway`, `nav1`, `pattern`, `formation`, `altEntryAgl`, `speedEntryKn`, `pitchIntervalS`, `speedDownwindKn`

When clicking **LOAD DATACARTRIDGE**, the full mission payload (including the groups above) is loaded into the active addon DataCartridge.

### Stored option / local storage key
- `GeoFSMissionPlanner.v2`: complete mission JSON snapshot

## Active Addon API (public)
The addon runtime exposes the active addon via BasePlugin:

```js
window.BasePlugin.getActiveAddon()
```

### Modules overview

#### `window.BasePlugin.getActiveAddon().lifecycle`
- `start()`
- `stop()`
- `restart()`
- `isRunning()`

#### `window.BasePlugin.getActiveAddon().options`
- `buildKey(pageTitle, buttonKey)`
- `read()`
- `get(pageTitle, buttonKey, fallback?)`
- `set(pageTitle, buttonKey, value)`
- `getValue(pageTitle, buttonKey, fallback?)`

#### `window.BasePlugin.getActiveAddon().checklists`
- `getModule()`
- `addChecklist(definition)`
- `getChecklists(type)`
- `getCurrentChecklist(type)`
- `getCurrentItemCompleted(type)`
- `markNextCurrentItem(type)`
- `setCurrentIndex(type, index)`
- `nextChecklist(type)`
- `nextChecklistNoWrap(type)`
- `prevChecklist(type)`
- `setCurrentCompleted(type, completed)`
- `toggleCurrentCompleted(type)`
- `resetCurrent(type)`
- `resetType(type)`

#### `window.BasePlugin.getActiveAddon().weapons`
- `getMode()`
- `getLoadout()`
- `getSelectedWeapon()`
- `selectNext(minimumQuantity?)`
- `fireSelected()`
- `jettisonSelected()`
- `startRearm(config)`
- `getRearmState()`

#### `window.BasePlugin.getActiveAddon().controls`
- `setProbeState(state)` // `OPEN` or `CLOSED`
- `getProbeState()`

#### `window.BasePlugin.getActiveAddon().dataCartridge`
- `clear()`
- `loadMissionData(missionData, options?)`
- `getMissionData()`
- `getMissionName()`
- `getGroup()`
- `getFlight()`
- `getWingman()`
- `getFlightData()`
- `getPositions()`
- `getCruise()`
- `getLanding()`
- `getFlightPlan()`
- `getNavaids()`
- `getMarkpoints()`
- `getAreas()`
- `getChecklists()`
- `getIffCodes()`
- `getRenderableData()`
- `addTgpMarkpoint(point, options?)`
- `setMarkpointType(index, type)`
- `deleteMarkpoint(index)`

#### `window.BasePlugin.getActiveAddon().flight`
- Replaces the old standalone ADI module on the `ADI` MFD page.
- `DISP` modes: `ADI`, `FLP`, `MRK`, `MISSION`, `IFF`.
- `FLP` and `MRK` use shared list navigation:
  - left: `↑` / `↓`
  - right: `ACT` / `DEL`
- In `MRK` mode, `TYPE` cycles: `TARGET`, `FRIENDLY`, `RESQUE`, `CIVILIAN`.
- `ACT` in `MRK` mode sends the selected markpoint to the targeting pod.

#### `window.BasePlugin.getActiveAddon().nav`
- `getModule()`
- `getCurrentNavUnit()`
- `getReadouts()`
- `getNavaidLabel()`
- `getAutopilotHeading()`

`window.BasePlugin.getActiveAddon().nav.getModule()` also exposes shared traffic filter helpers used by NAV and RDR:
- `getFooVisibilityMode()` // reads `RDR.FOO` (`SHOW`/`HIDE`)
- `shouldHideFooContacts()`
- `isFooCallsign(callsign)`
- `isTrafficContactVisible(callsign)`
- `filterMultiplayerContacts(users)`

#### `window.BasePlugin.getActiveAddon().map`
- `getModule()`
- `getRangeNm()`
- `setRangeNm(rangeNm)`
- `stepRange(step)`
- `clearSelectedTraffic()`
- `stepSelectedTraffic(step)`
- `getSelectedTrafficMark()`
- `cycleSelectedTrafficMark()`
- `getShowFilter()`
- `setShowFilter(value)`
- `cycleShowFilter()`
- `getSceneData()`

`window.BasePlugin.getActiveAddon().map.getModule()` additionally provides advanced helpers:
- `isRadarEnabled()`
- `getViewMode()` / `setViewMode(mode)` / `cycleViewMode()`
- `getTrafficInRange(contacts, rangeNm)`

> Note: traffic in NAV MAP/HSI is driven by `RDR.RADAR`. When `RDR.RADAR` is `OFF`, no multiplayer traffic is fetched or rendered on NAV and RDR pages.
>
> The RDR page also has `RDR.FOO` (`SHOW`/`HIDE`).
> - `SHOW`: callsign `Foo` is included.
> - `HIDE`: callsign `Foo` is filtered out from both NAV and RDR traffic rendering.
>
> This callsign filtering logic is centralized in `NavModule` and reused by both pages.
>
> NAV target stepping (`ACSEL`) is range-aware: it only cycles contacts inside the current `NAV.RANGE`.
>
> Multiplayer contacts are retained for up to 10 seconds after they disappear from `visibleUsers`. After that they are removed from NAV/RDR rendering and auto-deselected if selected.
>
> Traffic marks (`MARK`) are kept in memory during the flight, so if a contact reappears later it keeps its previous mark state.

#### `window.BasePlugin.getActiveAddon().communication`
- `getModule()`
- `getProfile()`
- `setProfile({ group, flight, wingman })`
- `getGroup()`
- `setGroup(value)`
- `getFlight()`
- `setFlight(value)`
- `getWingman()`
- `setWingman(value)`
- `getVoiceLanguage()`
- `setVoiceLanguage(language)`
- `getVoiceRate()`
- `setVoiceRate(rate)`
- `getMessages(mode?, limit?)` // mode: `ALL`, `GROUP`, `FLIGHT`, `WINGMAN`, `NONE`
- `getHudMessage()`

#### `window.BasePlugin.getActiveAddon().hud`
- `getModule()`
- `getMode()` // `F-18` or `DEFAULT`
- `setMode(mode)` // accepts `F-18` or `DEFAULT`
- `isCustomEnabled()`

`window.BasePlugin.getActiveAddon().nav.getReadouts()` returns a shared snapshot used by both HUD and MFD NAV rendering:

```js
{
  navUnit,
  dme,            // number | null
  bearing,        // number | null
  course,         // number | null
  timeToSignal,   // number | null
  navaidLabel,    // string, e.g. "ILS KJFK", "VOR ABC"
  autopilotHeading // number | null
}
```

`window.BasePlugin.getActiveAddon().map.getSceneData()` returns shared geometric data used by NAV `HSI` and `MAP` rendering:

```js
{
  ownship: { lat, lon, alt, heading } | null,
  rangeNm,        // selected NAV range
  traffic: [      // multiplayer aircraft in heading-relative NM offsets
    { uid, callsign, lat, lon, alt, forwardNm, rightNm }
  ],
  waypoints: [    // flightplan waypoints in heading-relative NM offsets
    { index, ident, selected, type, lat, lon, forwardNm, rightNm }
  ]
}
```

#### `window.BasePlugin.getActiveAddon().mfd`
- `getSlots()`
- `getDisplay(slotName?)`
- `addPage(pageDefinition, insertIndex?)`
- `setPageDefinition(target, pageDefinition)`
- `addDisplay(config?)`
- `getDisplayTransform(slotName?)`
- `updateDisplayTransform(slotName?, transform)`
- `getDisplayState(slotName)`
- `setPage(slotName, pageIndex)`
- `nextPage(slotName)`
- `toggleButton(slotName, side, index)`

Console examples:

```js
window.BasePlugin.getActiveAddon().mfd.getDisplay('LEFT');
window.BasePlugin.getActiveAddon().mfd.getDisplayTransform('LEFT');
window.BasePlugin.getActiveAddon().mfd.updateDisplayTransform('LEFT', {
  position: [-0.2160, 6.158, 0.584],
  rotation: [8, 0, 0],
  scale: [0.29, 0.29, 0.285]
});
```

The same methods are available on the active addon MFD returned by `window.BasePlugin.getActiveAddon()`.

### MFD page/button definition options
When you add or overwrite an MFD page, use this structure:

```js
{
  title: 'PAGE',
  leftButtons: [/* button defs */],
  rightButtons: [/* button defs */],
  lines: [],
  render: (renderer, renderContext) => {}
}
```

Each button object can use:

- `key`: logical option key (stored as `PAGE.KEY`)
- `label`: button label shown on MFD
- `states`: selectable states (cycled on click)
- `stateIndex`: default state index
- `values`: optional mapped values for states (used by `options.getValue`)
- `onClick(ctx)`: custom click callback
- `show(ctx)`: conditionally show/hide button
- `managedExternally: true`: do not auto-cycle/persist after click (you handle it in `onClick`)
- `combinedAction: true`: mark as part of a grouped action block
- `combinedGroupLabel`: label shown for grouped block
- `minimal: true`: for combined groups, hide bracket/group label and show only a centered state/value between the grouped buttons

`onClick` and `show` receive a context object with:
- `page`
- `button`
- `uiState`
- `side`
- `index`
- (for `onClick`) `currentIndex`, `nextIndex`, `nextState`

### Example: conditional button with `show()`

```js
{
  key: 'FIRE',
  label: 'FIRE',
  states: ['N/A'],
  stateIndex: 0,
  show: () => window.BasePlugin.getActiveAddon().options.get('WPN', 'MASTER', 'OFF') !== 'OFF',
  onClick: () => window.BasePlugin.getActiveAddon().weapons.fireSelected()
}
```

### Example: grouped buttons (`combinedAction`)

```js
rightButtons: [
  {
    key: 'PLAYBACK',
    label: 'START',
    states: ['START'],
    combinedAction: true,
    combinedGroupLabel: 'PLAYBACK',
    managedExternally: true,
    onClick: () => window.FlightRecorder?.api?.playback?.start?.()
  },
  {
    key: 'PLAYBACK',
    label: 'PAUSE',
    states: ['PAUSE'],
    combinedAction: true,
    combinedGroupLabel: 'PLAYBACK',
    managedExternally: true,
    onClick: () => window.FlightRecorder?.api?.playback?.pause?.()
  },
  {
    key: 'PLAYBACK',
    label: 'STOP',
    states: ['STOP'],
    combinedAction: true,
    combinedGroupLabel: 'PLAYBACK',
    managedExternally: true,
    onClick: () => window.FlightRecorder?.api?.playback?.stop?.()
  }
]
```

### Shared option keys (via `F18Options`)
The MFD writes and reads shared options using normalized keys like `PAGE.BUTTON`.

Known keys used by the addon:

- `REC.STATE`
- `REC.PLAYBACK`
- `HUD.BRIGHT`
- `HUD.HUD`
- `HUD.LEVEL`
- `HUD.MAX_G`
- `HUD.COLOR`
- `SYS.FLAPS`
- `SYS.SPEEDBRAKE`
- `SYS.REFUELING`
- `CHK.PREV`
- `CHK.N_A1`
- `CHK.ALL`
- `CHK.N_A2`
- `CHK.TYPE`
- `CHK.NEXT`
- `CHK.N_A3`
- `CHK.N_A31`
- `CHK.CHECK_ITEM`
- `CHK.RESET`
- `CHK.COMPLETE`
- `WPN.MASTER`
- `WPN.SELECT`
- `WPN.CONFIG`
- `WPN.MODE`
- `WPN.FIRE`
- `WPN.JETTISON`
- `WPN.REARM`
- `COMM.VOICE`
- `COMM.DISPLAY`
- `COMM.HUD`
- `COMM.GROUP`
- `COMM.FLIGHT`
- `COMM.WINGMAN`
- `COMM.VOICE_LANG`
- `RDR.RADAR`
- `RDR.RNG`
- `RDR.FOO`

### Weapon state storage
Weapon runtime state is stored separately in `F18WpnState`.

### Example: wait for addon + add checklist

```js
const poll = setInterval(() => {
  const api = window.BasePlugin.getActiveAddon()?.checklists;
  if (!api) return;
  clearInterval(poll);

  api.addChecklist({
    type: 'OPS',
    title: 'My Procedures',
    items: ['Briefing complete', 'Weather checked'],
    completed: false,
  });
}, 500);
```

### Example: shared options

```js
const addon = window.BasePlugin.getActiveAddon();
if (!addon) throw new Error('Active addon not ready');

// Set the WPN.MASTER (Master arm switch) to ON.
addon.options.set('WPN', 'MASTER', 'ON');

// Get the WPN.MASTER state, with a default value of OFF if it isn't set.
console.log(addon.options.get('WPN', 'MASTER', 'OFF')); // Returns ON
```

### Example: per-display MFD state

```js
const addon = window.BasePlugin.getActiveAddon();
if (!addon) throw new Error('Active addon not ready');

addon.mfd.setPage('LEFT', 3);  // only LEFT display changes page
addon.mfd.setPage('RIGHT', 1); // only RIGHT display changes page
```

### Example: add an extra MFD via API

```js
const addon = window.BasePlugin.getActiveAddon();
if (!addon) throw new Error('Active addon not ready');

const extra = addon.mfd.addDisplay({
  name: 'CENTER',
  position: [0, 6.158, 0.584],
  rotation: [8, 0, 0],
  scale: [0.29, 0.29, 0.285],
  defaultPageTitle: 'HUD'
});

console.log('Added MFD slot:', extra.slotName, 'part:', extra.partName);
```

### Example: read MFD position/rotation/scale

```js
const addon = window.BasePlugin.getActiveAddon();
if (!addon) throw new Error('Active addon not ready');

const rightTransform = addon.mfd.getDisplayTransform('RIGHT');
console.log(rightTransform);
// {
//   slotName: 'RIGHT',
//   partName: 'mfdPartRIGHT',
//   position: [0.2167, 6.158, 0.584],
//   rotation: [8, 0, 0],
//   scale: [0.29, 0.29, 0.285]
// }
```

### Example: update MFD position/rotation/scale

```js
const addon = window.BasePlugin.getActiveAddon();
if (!addon) throw new Error('Active addon not ready');

const result = addon.mfd.updateDisplayTransform('CENTER', {
  position: [0.0, 6.02, 0.40],
  rotation: [23, 0, 0],
  scale: [0.30, 0.30, 0.30]
});

if (!result.ok) {
  console.warn('MFD transform update failed:', result.reason);
} else {
  console.log('Updated transform:', result);
}
```

`updateDisplayTransform(slotName?, transform)` supports partial updates as well. For example:

```js
// Only update scale of LEFT MFD.
addon.mfd.updateDisplayTransform('LEFT', {
  scale: [0.28, 0.28, 0.28]
});
```

### Example: add a custom MFD page

```js
const addon = window.BasePlugin.getActiveAddon();
if (!addon) throw new Error('Active addon not ready');

addon.mfd.addPage({
  title: 'TACT',
  leftButtons: [
    { key: 'MODE', label: 'MODE', states: ['A', 'B', 'C'], stateIndex: 0 }
  ],
  rightButtons: [
    { key: 'RNG', label: 'RNG', states: ['10', '20', '40'], stateIndex: 1 }
  ],
  lines: [],
  render: (renderer, renderContext) => {
    const ctx = renderContext?.ctx ?? renderer?.canvasAPI?.context;
    const w = renderContext?.w ?? renderer?.canvasAPI?.canvas?.width ?? 512;
    const h = renderContext?.h ?? renderer?.canvasAPI?.canvas?.height ?? 512;
    if (!ctx) return;

    ctx.save();
    ctx.fillStyle = renderContext?.color ?? '#00ff66';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(h * 0.06)}px monospace`;
    ctx.fillText('TACTICAL PAGE', w * 0.5, h * 0.5);
    ctx.restore();
  }
});
```

### Example: overwrite an existing page

```js
const addon = window.BasePlugin.getActiveAddon();
if (!addon) throw new Error('Active addon not ready');

addon.mfd.setPageDefinition('AUX1', {
  title: 'MAP',
  leftButtons: [
    { key: 'LAYER', label: 'MAP', states: ['OFF', 'ON'], stateIndex: 1 }
  ],
  rightButtons: [
    { key: 'ZOOM', label: 'ZOOM', states: ['1X', '2X', '4X'], stateIndex: 0 }
  ],
  lines: [],
  render: (renderer, renderContext) => {
    const ctx = renderContext?.ctx ?? renderer?.canvasAPI?.context;
    const w = renderContext?.w ?? renderer?.canvasAPI?.canvas?.width ?? 512;
    const h = renderContext?.h ?? renderer?.canvasAPI?.canvas?.height ?? 512;
    if (!ctx) return;

    ctx.save();
    ctx.fillStyle = renderContext?.color ?? '#00ff66';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(h * 0.06)}px monospace`;
    ctx.fillText('CUSTOM MAP PAGE', w * 0.5, h * 0.5);
    ctx.restore();
  }
});
```

### Example: configure communication filters + voice

```js
const addon = window.BasePlugin.getActiveAddon();
if (!addon) throw new Error('Active addon not ready');

addon.communication.setProfile({
  group: 'BlueAngels',
  flight: 'FlightAlpha',
  wingman: 'BA2'
});

addon.communication.setVoiceLanguage('en-US');

// Read the latest 5 messages that are outside your configured filters.
const outsideMessages = addon.communication.getMessages('ALL', 5);
console.log(outsideMessages);
```

## Flight Recorder API
The Flight Recorder now exposes a public API on `window.FlightRecorder.api` so other scripts/plugins can control recording and playback.

You can always check if it is available:

```js
if (window.FlightRecorder?.api) {
	// API ready
}
```

As a lot of GeoFS files get loaded when you start GeoFS, it might take a while before my addons are available. In [this script](geo-fs-f18-mod-flightplan.js) you can see how to wait until a specific API is available.

### Version
- `window.FlightRecorder.api.getVersion()`

### State
- `window.FlightRecorder.api.getState(trackIds?)`
- `window.FlightRecorder.api.recording.getState()`
- `window.FlightRecorder.api.playback.getState(trackIds?)`

### Recording controls
- `window.FlightRecorder.api.recording.start()`
- `window.FlightRecorder.api.recording.stop()`

### Playback controls
- `window.FlightRecorder.api.playback.start(trackIds?)`
- `window.FlightRecorder.api.playback.pause(trackIds?)`
- `window.FlightRecorder.api.playback.stop(trackIds?)`

`trackIds` is optional and can be:
- omitted (all playable tracks)
- a single track id string (example: `"T0001"`)
- an array of track ids (example: `["T0001", "T0002"]`)

### Return values
Control methods return an object with fields like:
- `ok` (boolean)
- `state` (global playback or recording state)
- `reason` (when not successful, e.g. `"NO_TRACKS"`)
- `trackIds` (affected track ids, for playback methods)

Example:

```js
const api = window.FlightRecorder?.api;
if (!api) throw new Error('Flight Recorder API not available');

console.log('FR version:', api.getVersion());
console.log('Current state:', api.getState());

api.recording.start();
// ...
api.recording.stop();

api.playback.start();
api.playback.pause();
api.playback.stop();
```

## Strict API contracts (current implementation)

This section documents the active code contracts used by:
- [geo-fs-f18-mod.js](geo-fs-f18-mod.js)
- [geo-fs-flight-recorder.js](geo-fs-flight-recorder.js)

### F18 addon: external dependency contracts

#### `window.FlightRecorder.api` contract used by F18
If `window.FlightRecorder.api` exists, F18 assumes all of the following are present and valid:

- `getVersion(): string` returns a valid semver string (`major.minor.patch`).
- `recording.getState(): { state: string, isRecording: boolean }`
- `recording.start(): { ok: boolean, state: string, reason?: string }`
- `recording.stop(): { ok: boolean, state: string, reason?: string }`
- `playback.getState(trackIds?): { state: string, tracks: Array<object> }`
- `playback.start(trackIds?)`, `playback.pause(trackIds?)`, `playback.stop(trackIds?)`

F18 MFD mapping:
- recorder state: `isRecording === true` -> `RECORDING`, otherwise `STOPPED`
- playback state: `state === 'PLAYING'` -> `STARTED`, otherwise `STOPPED`

#### `localStorage` contract used by F18
- `F18Options` stores a JSON object `{ [optionKey: string]: string }`.
- `F18WpnState` stores a JSON object:

```js
{
  config: string,
  loadout: {
    gun: number,
    left: { [station: string]: { load: string, display: string, quantity: number, type: string } },
    right: { [station: string]: { load: string, display: string, quantity: number, type: string } }
  },
  selected: {
    [mode: string]: { side: 'left' | 'right' | 'center', station: string }
  }
}
```

No migration path is implemented for old storage formats.

### Active addon public API return contracts

#### `window.BasePlugin.getActiveAddon().options`
- `buildKey(pageTitle, buttonKey): string`
- `read(): Record<string, string>`
- `write(options): true`
- `get(pageTitle, buttonKey, fallback?): string | null`
- `set(pageTitle, buttonKey, value): void`
- `getValue(pageTitle, buttonKey, fallback?): string | number | null`

#### `window.BasePlugin.getActiveAddon().weapons`
- `getMode(): 'NAV' | 'A/A' | 'A/G' | 'JETTISON'`
- `getLoadout(): object`
- `getSelectedWeapon(): { side: string, station: string } | null`
- `selectNext(minimumQuantity?): boolean`
- `fireSelected(): boolean`
- `jettisonSelected(): boolean`
- `startRearm(config): boolean`
- `getRearmState(): object`

#### `window.BasePlugin.getActiveAddon().mfd`
- `getSlots(): string[]`
- `addPage(pageDefinition, insertIndex?): { ok: true, index: number, title: string } | { ok: false, reason: string }`
- `setPageDefinition(target, pageDefinition): { ok: true, index: number, title: string | null } | { ok: false, reason: string }`
- `addDisplay(config?): { slotName: string | null, partName: string | null }`
- `getDisplayTransform(slotName?): object`
- `updateDisplayTransform(slotName?, transform): { ok: boolean, reason?: string, slotName?: string, partName?: string, position?: number[], rotation?: number[], scale?: number[] }`
- `getDisplayState(slotName): object | null`
- `setPage(slotName, pageIndex): boolean`
- `nextPage(slotName): boolean`
- `toggleButton(slotName, side, index): boolean`

MFD page APIs now use exact values:
- `setPageDefinition(target, ...)` resolves string `target` by exact page-title match (case-sensitive, no trimming).
- `addPage(...)` / `setPageDefinition(...)` store the passed `pageDefinition` object as-is; required page fields must already be valid.

#### `window.BasePlugin.getActiveAddon().lifecycle`
- `start(): true`
- `stop(): boolean` (`false` when plugin is not running)
- `restart(): true`
- `isRunning(): boolean`

### Active addon exception cases (documented)

Only relevant cases are listed:

- `window.BasePlugin.getActiveAddon().options.read()` can throw `SyntaxError` when addon options contain invalid JSON.
- `window.BasePlugin.getActiveAddon().options.write()` / `set()` can throw `DOMException` on storage write failures.
- Weapon state boot (`loadWpnStateFromStorage`) can throw when `F18WpnState` is invalid or incomplete.
- Flight Recorder bridge calls can throw `TypeError` when `window.FlightRecorder.api` exists but does not match the required contract.
- Checklist APIs throw `Error` for unsupported checklist types.
- Checklist APIs throw `Error` when a checklist has invalid `itemCompleted` shape (must match `items.length`).

### Flight Recorder API return contracts

#### `window.FlightRecorder.api`
- `getVersion(): string`
- `getState(trackIds?): {
    version: string,
    recordState: 'IDLE' | 'RECORDING',
    playState: 'IDLE' | 'PLAYING',
    recording: { state: 'IDLE' | 'RECORDING', isRecording: boolean },
    playback: { state: 'IDLE' | 'PLAYING', tracks: Array<{ id: string, name: string, playbackState: 'STOPPED' | 'PAUSED' | 'PLAYING', idx: number, sampleCount: number, sampleMs: number }> }
  }`

#### `window.FlightRecorder.api.recording`
- `start(): { ok: boolean, state: string, reason?: string }`
- `stop(): { ok: boolean, state: string, reason?: string }`
- `getState(): { state: 'IDLE' | 'RECORDING', isRecording: boolean }`

#### `window.FlightRecorder.api.playback`
- `start(trackIds?): { ok: boolean, state: string, trackIds?: string[], reason?: string }`
- `pause(trackIds?): { ok: boolean, changed?: number, state: string, trackIds?: string[], reason?: string }`
- `stop(trackIds?): { ok: boolean, changed?: number, state: string, trackIds?: string[], reason?: string }`
- `getState(trackIds?): { state: 'IDLE' | 'PLAYING', tracks: Array<{ id: string, name: string, playbackState: 'STOPPED' | 'PAUSED' | 'PLAYING', idx: number, sampleCount: number, sampleMs: number }> }`

### Flight Recorder exception cases (documented)

- `openRecorderDb()` throws when IndexedDB is unavailable or opening fails.
- `saveToIndexedDB()` and `loadFromIndexedDB()` catch IndexedDB errors and return `false`.
- Promise flows that call `openRecorderDb()` may surface IndexedDB errors when not caught upstream.


# TODO
## Integrations
https://github.com/tylerbmusic/GeoFS-Failures/blob/main/userscript.js
https://github.com/OC135/GeoFs-weapon-addon/tree/main
https://github.com/Popper412/Gunniing-System-GeoFS/blob/main/GeoFS-Gunning-System-DEMO
https://radarthing.com/

## Controls (like fuel probe)
V Have control buttons bottom right in GeoFS UI (like PROBE OPEN/CLOSED)
- Add option to keybind controls

## Seats
- Add seat reset button
- Move to SeatModule

## Modules
Alle functionaliteit in aparte modules, zodat je later dit ook naar andere vliegtuigen kan brengen.

## Spoiler
V Option to set max spoiler position (10% to FULL) with combined buttons

## LIMITS
- Add limits based on config in MFD (weapon config, or probe in/out, current speed, etc.)
- If limit is exceeded send warning state, led HUD and MFD module display warning

## DAMAGE
- If limit is exceeded, simulate failure (fe. gear cannot change state anymore, or flaps go to 0)
- Change SYS page to show damaged parts + change current indicators to F-18 with red faults.

## FUEL
- Manage fuel flow (calculate in PFC). If fuel is 0, engine off. 
- Allow in flight refueling by extending probe and fly without autopilot in a certain box (fe. speed 250, alt 10,000, heading 255). When conditions are met, fuel is replenished.

## Speech
- Make a seperate speach plugin to read out chat + API to use it
  - Integrate this in MFD with VOICE ON/OFF button

## Pages
### RADAR
- Add Radar page + control to turn it on/off.
- Add HSI page with option to change course/heading

### Scratchpad
- Add scratchpad and buttons to center
  - The scratchpad can be in a mode (fe. HDGSELECT). The mode is displayed. When pressing enter the scratched heading is used.
- Add push buttons below to select display. On the right of the scratchpad a few displays with a button show data. WHen pressing the button you can change the value in the scratchpad.
  - FE. AP button. You push it and see on the displays on the right alt/speed/heading. You push a button heading, and you go into heading select mode for the scratchpad.
  - FE. IFF button. You can type in your IFF number. IFF is displayed on the right.

## IFF
- Should be a seperate module, with custom API.
- Integration with MfdModule: Add page. Let you set shared IFF code.
- If on and target locked, change username to username[IFF-id-other-aircraft+code]. The other aircraft should calculate response based on their IFF number and the code. And change their username to [IFFR+response-code]. If the interrogating aircraft receives this response, it changes to [IFF-FRIEND-id-other-aircraft] (or FOO)


























