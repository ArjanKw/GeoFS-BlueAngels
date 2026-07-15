Use this manual to (re)write our code.

# Ask when in doubt
If you don't know what API is available, or what return types you can expect, or have any questions in which the outcome impacts the code: ask it before implementing it. I don't want defensive code with checks and paths and fallbacks and unnecessary casts, just so that all possible answers to a question you have are implemented.

# Performance
Do write code with performance in mind. Don't write redundant code, or invoke methods just to be sure (like to `trim()` output or put it `toUppercase()`, while returned data is controlled by us and thus will always be uppercase and without spaces). Be very careful with writing try/catch statements, don't use them unless they are crucial to handle a common exception that we need to handle logically. I rather have exceptions to be thrown, instead of them happening all the time, but being surpressed.

Do not overoptimize any part, unless there is significant benefit. Ask if you're in doubt. Readable code is just as important. 

# Lean code for known API
I want our code to fail when an API changes instead of a 'defensive' code style, where every function expects the outside world to be unknown and thus capable of producing all kinds of output, that in real life will never occur.

For example: our `getOption(key, value, fallback)` ALWAYS returns a string. So just use `const ourOption = getOption('KEY', 'VALUE', 'OURFALLBACK');` instead of `const ourOption = (String(getOption('KEY', 'VALUE', 'OURFALLBACK') ?? 'OURFALLBACK') ?? 'OURFALLBACK').trim().toUpperCase();`

Do not write functions for every API call, but write small functions and only create new functions if you want to reuse or group a block of logic. So instead of:

```js
function getFlightRecorderApi() {
    return window.FlightRecorder?.api ?? null;
}

function getFlightRecorderVersion(api = getFlightRecorderApi()) {
    if (!api || typeof api.getVersion !== 'function') return null;
    try {
        return String(api.getVersion() ?? '').trim() || null;
    } catch (e) {
        return null;
    }
}
function isFlightRecorderCompatible(api = getFlightRecorderApi()) {
    if (!api) return false;
    const version = getFlightRecorderVersion(api);
    if (!version) return false;
    return isSemverAtLeast(version, FLIGHT_RECORDER_MIN_VERSION);
}
```

Write something like this:

```js
function isFlightRecorderCompatible() {
    return isSemverAtLeast(window.FlightRecorder?.api.getVersion() ?? '0.0.0', FLIGHT_RECORDER_MIN_VERSION);
}
```

Or instead of this:

```js
function getFlightRecorderRecordingState(api = getFlightRecorderApi()) {
    if (!isFlightRecorderCompatible(api)) return 'OFF';

    let raw = null;
    try {
      raw = api?.recording?.getState?.();
    } catch (e) {
      raw = null;
    }

    if (raw && typeof raw === 'object' && typeof raw.recording === 'boolean') {
      return raw.recording ? 'RECORDING' : 'STOPPED';
    }

    const nested = getNestedStateValue(raw);
    return normalizeFlightRecorderRecordingState(nested);
  }
function normalizeFlightRecorderRecordingState(rawState) {
    const value = String(rawState ?? '').trim().toUpperCase();
    if (value.includes('RECORD')) return 'RECORDING';
    if (value.includes('STOP')) return 'STOPPED';
    if (value.includes('OFF') || value.includes('IDLE') || value.includes('NONE')) return 'OFF';
    return 'OFF';
  }
```
Write this:

```js
  const state = api?.recording?.getState() ?? 'OFF';
```

Do not write this:
```js
// Reads the configured voice synthesis language.
    getVoiceLanguage() {
      return String(getOption('COMM', 'VOICE_LANG', 'en-US') ?? 'en-US') || 'en-US';
    }
```

Write this:

```js
const lang = getOption('COMM', 'VOICE_LANG', 'en-US');
```

# Write in modules
Almost all code, except for the very basic initialization code, should be written in a module class that fits the domain. Generic helper functions (like `isSemverAtLeast`) should be in a HelperModule. Ask before putting anything outside of a module. Each module should have a clear responsibility.

# Documentation
Document the public API that each module exposes in the README.md. Also document each stored option.
Write code comments in English, short but good to understand language.
The comments should explain difficult code parts, on what step we're doing and why.

# Normalize
Do NOT 'normalize' data, unless given express permission.

Do not write:

```js
normalizeType(type) {
      const value = String(type ?? '').trim().toUpperCase();
      return this.types.includes(value) ? value : 'PROC';
    }

getChecklists(type) {
      const normalized = this.normalizeType(type);
      return this.checklistsByType[normalized] ?? [];
    }
```

Write:
```js
getChecklists(type) {
      return this.checklistsByType[type] ?? [];
    }
```

Do not write:
```js
setChannelValue(controlKey, partName, valueKey, state, value) {
      const control = this.getControlByKey(controlKey);
      if (!control) return false;

      const partNameNorm = String(partName || '').trim();
      const valueKeyNorm = String(valueKey || '').trim();
      const stateNorm = String(state || '').trim().toUpperCase();
      const numericValue = Number(value);
      if (!partNameNorm || !valueKeyNorm || !stateNorm || !Number.isFinite(numericValue)) return false;

      const partDef = control.parts.find((p) => String(p?.partName || '').trim() === partNameNorm);
      if (!partDef) return false;
      ...
```

Write:
```js
setChannelValue(controlKey, partName, valueKey, state, value) {
      const control = this.getControlByKey(controlKey);
      if (!control) return false;

      const numericValue = Number(value);
      if (!partName || !valueKey || !state || !Number.isFinite(numericValue)) return false;

      const partDef = control.parts.find((p) => p.partName === partName);
      if (!partDef) return false;
      ...
```