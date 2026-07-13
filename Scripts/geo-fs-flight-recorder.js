// ==UserScript==
// @name         GeoFS Flight Recorder
// @namespace    https://github.com/ArjanKw/GeoFS-BlueAngels/
// @version      2.0.0
// @description  Record and replay GeoFS flights, and share them with others.
// @match        https://www.geo-fs.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /* ---------- Config ---------- */
  const VERSION = '2.0.0';
  const LS_CALLSIGN_KEY = 'FlightRecorder100Callsign';
  const IDB_NAME = 'FlightRecorder100DB';
  const IDB_VERSION = 1;
  const IDB_STORE = 'projects';
  const IDB_PROJECT_KEY = 'main';
  const MAX_DT_CAP = 120;
  const MAX_RECORD_STEPS_PER_FRAME = 800;
  const HIDE_NODE_HINTS = ['ladder', 'stairs', 'boarding'];
  const DOOR_NODE_HINTS = ['door', 'hatch', 'bay'];
  const WHEEL_NODE_HINTS = ['wheel', 'bogie', 'truck', 'tire', 'tyre'];
  const BASE_GEAR_NODE_HINTS = ['gear', 'strut', 'oleo', 'shock'];
  const EXTRA_GEAR_NODE_HINTS = [
    'leftgear', 'rightgear', 'frontgear', 'nosegear', 'maingear',
    'geardoor', 'gear_door',
    'leftgeardoor', 'rightgeardoor', 'frontgeardoor', 'nosegeardoor', 'susF', 'susR', 'susL',
    'gearactuator',
    'gearstrut'
  ];
  const AIRCRAFT_NODE_OVERRIDES = [
    {
      aircraftId: "4",
      ignoreNodes: [],
      gearNodes: ["nose_damper_lower", "nose_damper_upper", "nose_leg"],
      hideNodes: []
    },
    {
      aircraftId: "18",
      ignoreNodes: [],
      gearNodes: ["RG_Holder_L", "RG_Holder_R", "RG_Main_L", "RG_Main_R"],
      hideNodes: []
    },
    {
      aircraftId: "20",
      ignoreNodes: ["door_cargo", "door_passenger", "door_passenger_hinge", "door_svc_hinge"],
      gearNodes: [],
      hideNodes: []
    },
    {
      aircraftId: "24",
      ignoreNodes: ["CargoDoor1", "CargoDoor2", "DoorL1", "DoorL2", "DoorL3", "DoorL4", "DoorR1", "DoorR2", "DoorR3", "DoorR4", "frontGearDoor1", "frontGearDoor2", "gearLeftDoorMain", "gearRightDoorMain"],
      gearNodes: [],
      hideNodes: []
    },
    {
      aircraftId: "25",
      ignoreNodes: ["frontDoorLeft1", "frontDoorRight1", "gearLeftDoor", "gearRightDoor"],
      gearNodes: [],
      hideNodes: ["knot", "ribbon"]
    },
    {
      aircraftId: "27", // F-18
      ignoreNodes: ["RefDoor1", "RefDoor2"],
      gearNodes: [],
      hideNodes: []
    },
    {
      aircraftId: "29",
      ignoreNodes: ["frontGearDoor1"],
      gearNodes: [],
      hideNodes: []
    },
    {
      aircraftId: "32",
      ignoreNodes: ["leftGearDoor2", "rightGearDoor2"],
      gearNodes: [],
      hideNodes: []
    },
    {
      aircraftId: "3591",
      ignoreNodes: ["doorLFront", "gearDoorFrontFar"],
      gearNodes: ["actuatorL1", "actuatorR1", "Cylinder.023", "Cylinder.031", "frontPivot", "hubL", "hubR", "susF", "susL", "susR", "tlpivotmoverL"],
      hideNodes: []
    },
  ];
  const LIVERY_ID_OFFSET = 10000;

  let defaultSampleMs = 33; // 30 Hz
  let easingOn = false;
  let ultraStrength = 100; // 0..100
  let recordCallsign = '';
  let showCallsign = true;
  let playbackSliderDragging = false;
  let lastSliderSeekTs = 0;
  const UI_UPDATE_INTERVAL_MS = 100;
  let idbOpenPromise = null;

  /* ---------- State machines ---------- */
  let recordState = 'IDLE'; // IDLE | RECORDING
  let playState = 'IDLE';   // IDLE | PLAYING

  /* ---------- Runtime ---------- */
  let tracks = [];
  let currentRec = null; // draft, hidden from list until stop
  let lastMainT = 0;
  let lastUiUpdateT = 0;
  let nextTrackNumber = 1;

  let guiWin = null;
  const gui = {};
  const FR_PANEL_ID = 'flight-recorder-panel';
  const FR_BUTTON_ID = 'flight-recorder-button';
  const trackSelectionState = new Map();
  let activePilotTrackId = null;
  let frKeyboardShieldBound = false;
  let frToggleHotkeyBound = false;

  /* ---------- Utils ---------- */
  const now = () => performance.now();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, f) => a + (b - a) * f;
  const smoothstep = (f) => f * f * (3 - 2 * f);
  const lerpAngleDeg = (a, b, f) => {
    const d = ((b - a + 540) % 360) - 180;
    return a + d * f;
  };
  const angleDeltaDeg = (a, b) => ((b - a + 540) % 360) - 180;
  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sanitizeCallsign = (value) => {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 24);
  };
  const getModelDisplayName = (modelUrl) => {
    const raw = String(modelUrl || '').trim();
    if (!raw) return '-';

    const noQuery = raw.split('?')[0].split('#')[0];
    const fileName = noQuery.split(/[\\/]/).pop() || '';
    if (!fileName) return '-';

    const dot = fileName.lastIndexOf('.');
    const baseName = dot > 0 ? fileName.slice(0, dot) : fileName;
    return baseName || '-';
  };

  lastMainT = now();

  function metersPerDeg(latDeg) {
    return {
      mLat: 111132,
      mLon: 111320 * Math.cos(latDeg * Math.PI / 180)
    };
  }

  function interpLLA(a, b, f, out) {
    out[0] = lerp(a[0], b[0], f);
    const dLon = ((b[1] - a[1] + 540) % 360) - 180;
    out[1] = a[1] + dLon * f;
    out[2] = lerp(a[2], b[2], f);
    return out;
  }

  /* ---------- Track helpers ---------- */
  function makeTrackBase(ac, sampleMs, callsign = '') {
    const orderId = nextTrackNumber++;
    const id = `T${String(orderId).padStart(4, '0')}`;
    const createdAt = Date.now();
    const lat0 = ac.llaLocation[0];
    const lon0 = ac.llaLocation[1];
    const m = metersPerDeg(lat0);
    const modelUrl = ac?.object3d?.model?._model?._resource?.url;
    return {
      orderId,
      id,
      name: `${ac.aircraftRecord?.name || 'Unknown'} ${id}`,
      callsign: sanitizeCallsign(callsign),
      description: '',
      createdAt,
      aircraftId: String(ac?.id ?? ac?.aircraftRecord?.id ?? ''),
      modelUrl,
      sampleMs,
      base: { lat0, lon0, mLat: m.mLat, mLon: m.mLon },
      lla: [],
      htr: [],
      xy: [],
      gearEvents: [],
      liveryEvents: [],
      messageEvents: []
    };
  }

  function initTrackRuntime(tr) {
    tr._ghost = null;
    tr._ghostLabel = null;
    tr._nodeCache = { ready: false, all: [], gear: [], wheels: [], doors: [], hideNodes: [] };
    tr._precision = null;
    tr._pool = {
      lla: [0, 0, 0],
      htr: [0, 0, 0],
      tmpA: [0, 0, 0],
      tmpB: [0, 0, 0],
      tmpC: [0, 0, 0]
    };
    tr._play = {
      playing: false,
      paused: true,
      idx: 0,
      startT: now(),
      lastT: now(),
      lastMsgIdx: -1
    };
    tr._state = { mode: 'ghost', gearUp: null };
    tr._pilotFollow = false;
    tr._pilotNextSyncAt = 0;
    tr._pilotOwnLiveryKey = '';
    tr._lastGearUp = null;
    tr._rec = {
      recording: false,
      sampleCount: tr.lla.length,
      targetSamples: tr.lla.length,
      startT: 0,
      lastGearUp: null,
      lastLiverySig: null
    };
    tr._livery = {
      applying: false,
      lastSig: null,
      appliedSig: null,
      resetSig: null,
      applyRunId: 0,
      activeApplyRunId: 0,
      startApplyTimer: null,
      pendingId: null,
      pendingSnapshot: null,
      pendingSig: null,
      vaCache: Object.create(null),
      debug: {
        seq: 0,
        lastLine: '',
        lastApplyLine: '',
        lastTextureLine: '',
        lastRequestLine: '',
        history: []
      }
    };
  }

  function toDebugSafe(v) {
    return String(v == null ? '' : v).replace(/[|\n\r]/g, '_');
  }

  function buildProject() {
    return {
      version: VERSION,
      tracks: tracks.map((t) => ({
        orderId: t.orderId,
        id: t.id,
        name: t.name,
        callsign: sanitizeCallsign(t.callsign),
        description: t.description,
        createdAt: t.createdAt,
        aircraftId: t.aircraftId,
        modelUrl: t.modelUrl,
        sampleMs: t.sampleMs,
        base: t.base,
        lla: t.lla,
        htr: t.htr,
        xy: t.xy,
        gearEvents: t.gearEvents,
        liveryEvents: t.liveryEvents,
        messageEvents: t.messageEvents || []
      }))
    };
  }

  function updatePlayState() {
    playState = tracks.some((t) => t._play.playing) ? 'PLAYING' : 'IDLE';
  }

  function formatTrackDate(ts) {
    const d = new Date(Number(ts) || Date.now());
    try {
      return d.toLocaleString();
    } catch {
      return d.toISOString();
    }
  }

  function normalizeTrackMeta(tr, fallbackOrder) {
    const parsed = Number.parseInt(String(tr?.orderId ?? tr?.id ?? ''), 10);
    const orderId = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackOrder;
    const sampleMsRaw = Number(tr?.sampleMs);
    const sampleMs = Number.isFinite(sampleMsRaw) && sampleMsRaw > 0 ? Math.round(sampleMsRaw) : 16;
    const llaSource = Array.isArray(tr?.lla) ? tr.lla : [];
    const htrSource = Array.isArray(tr?.htr) ? tr.htr : [];
    const xySource = Array.isArray(tr?.xy) ? tr.xy : [];

    const lla = [];
    const htr = [];
    const xy = [];

    for (let i = 0; i < llaSource.length; i++) {
      const llaIn = llaSource[i];
      if (!Array.isArray(llaIn) || llaIn.length < 3) continue;

      const lat = Number(llaIn[0]);
      const lon = Number(llaIn[1]);
      const alt = Number(llaIn[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt)) continue;

      const htrIn = htrSource[i];
      const hdg = Number(Array.isArray(htrIn) ? htrIn[0] : 0);
      const pit = Number(Array.isArray(htrIn) ? htrIn[1] : 0);
      const rol = Number(Array.isArray(htrIn) ? htrIn[2] : 0);

      const xyIn = xySource[i];
      const x = Number(Array.isArray(xyIn) ? xyIn[0] : 0);
      const y = Number(Array.isArray(xyIn) ? xyIn[1] : 0);
      const z = Number(Array.isArray(xyIn) ? xyIn[2] : alt);

      lla.push([lat, lon, alt]);
      htr.push([
        Number.isFinite(hdg) ? hdg : 0,
        Number.isFinite(pit) ? pit : 0,
        Number.isFinite(rol) ? rol : 0
      ]);
      xy.push([
        Number.isFinite(x) ? x : 0,
        Number.isFinite(y) ? y : 0,
        Number.isFinite(z) ? z : alt
      ]);
    }

    const gearEvents = Array.isArray(tr?.gearEvents) ? tr.gearEvents : [];
    const liveryEvents = Array.isArray(tr?.liveryEvents) ? tr.liveryEvents : [];
    const messageEvents = Array.isArray(tr?.messageEvents) ? tr.messageEvents : [];

    tr.orderId = orderId;
    tr.id = String(tr.id || `T${String(orderId).padStart(4, '0')}`);
    tr.name = String(tr?.name || tr.id);
    tr.callsign = sanitizeCallsign(tr.callsign || '');
    tr.description = String(tr?.description || '');
    tr.createdAt = Number(tr.createdAt) || Date.now();
    tr.aircraftId = String(tr.aircraftId || '');
    tr.modelUrl = String(tr?.modelUrl || '');
    tr.sampleMs = sampleMs;
    tr.base = tr?.base || { lat0: 0, lon0: 0, mLat: 111132, mLon: 111320 };
    tr.lla = lla;
    tr.htr = htr;
    tr.xy = xy;
    tr.gearEvents = gearEvents;
    tr.liveryEvents = liveryEvents;
    tr.messageEvents = messageEvents;
    return tr;
  }

  function refreshNextTrackNumber() {
    let maxId = 0;
    for (const t of tracks) {
      const n = Number.parseInt(String(t?.orderId ?? 0), 10);
      if (Number.isFinite(n) && n > maxId) maxId = n;
    }
    nextTrackNumber = maxId + 1;
  }

  function ensureSelectionStateForTracks() {
    const existingIds = new Set(tracks.map((t) => t.id));
    for (const id of [...trackSelectionState.keys()]) {
      if (!existingIds.has(id)) trackSelectionState.delete(id);
    }
    for (const tr of tracks) {
      if (!trackSelectionState.has(tr.id)) trackSelectionState.set(tr.id, true);
    }
  }

  function isTrackSelected(trackId) {
    return trackSelectionState.get(trackId) !== false;
  }

  function setTrackSelected(trackId, selected) {
    trackSelectionState.set(trackId, !!selected);
  }

  function isEditableElement(el) {
    if (!el) return false;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function bindKeyboardShield() {
    if (frKeyboardShieldBound) return;
    frKeyboardShieldBound = true;

    const blockIfTyping = (ev) => {
      const panel = gui.panelEl || document.getElementById(FR_PANEL_ID);
      if (!panel) return;
      const active = document.activeElement;
      if (!active || !panel.contains(active)) return;
      if (!isEditableElement(active)) return;
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
    };

    window.addEventListener('keydown', blockIfTyping, true);
    window.addEventListener('keyup', blockIfTyping, true);
    window.addEventListener('keypress', blockIfTyping, true);
  }

  function isPanelVisible() {
    const panel = gui.panelEl || document.getElementById(FR_PANEL_ID);
    return !!panel && panel.classList.contains('geofs-visible');
  }

  function bindPanelToggleHotkey() {
    if (frToggleHotkeyBound) return;
    frToggleHotkeyBound = true;

    window.addEventListener('keydown', (ev) => {
      if (ev.defaultPrevented) return;
      if (ev.repeat) return;
      if (ev.altKey || ev.metaKey) return;
      if (isEditableElement(document.activeElement)) return;

      const isBackquote = ev.code === 'Backquote' || ev.key === '`';
      if (!isBackquote) return;

      ev.preventDefault();

      // Shift+` => toggle recording
      if (ev.shiftKey && !ev.ctrlKey) {
        if (recordState === 'RECORDING') stopRecording();
        else startRecordingWithSelectedPlaybacks();
        updateUi();
        return;
      }

      // Ctrl+` => toggle playback (selected tracks)
      if (ev.ctrlKey && !ev.shiftKey) {
        const selected = getSelectedTracks();
        const hasPlaying = selected.some((t) => t?._play?.playing);
        if (hasPlaying) stopSelectedTracks();
        else playSelectedTracks();
        return;
      }

      // ` => toggle panel
      if (!ev.ctrlKey && !ev.shiftKey) {
        togglePanel();
      }
    });
  }

  /* ---------- Node/matrix helpers ---------- */
  function getNode(model, name) {
    if (!model || !name) return null;
    const wanted = String(name);
    const wantedLow = wanted.toLowerCase();
    try {
      const a = model.getNode(wanted);
      if (a) return a;
      const b = model.getNode(wantedLow);
      if (b) return b;
      const c = model.getNode(wanted.toUpperCase());
      if (c) return c;
    } catch {
      // continue to runtime scan
    }

    try {
      const arr = model._runtime?.nodes || model._nodes;
      if (Array.isArray(arr)) {
        for (const n of arr) {
          const nn = String(n?.name || n?._name || n?.id || '');
          if (!nn) continue;
          if (nn === wanted || nn.toLowerCase() === wantedLow) return n;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  function classifyNodeName(name) {
    const low = String(name || '').toLowerCase();
    return {
      hideNodes: HIDE_NODE_HINTS.some((t) => low.includes(t)),
      doors: DOOR_NODE_HINTS.some((t) => low.includes(t)),
      wheels: WHEEL_NODE_HINTS.some((t) => low.includes(t)),
      gear: BASE_GEAR_NODE_HINTS.some((t) => low.includes(t)) || EXTRA_GEAR_NODE_HINTS.some((t) => low.includes(t))
    };
  }

  function nodeNameKey(name) {
    return String(name || '').trim().toLowerCase();
  }

  function getAircraftOverrideEntry(aircraftId) {
    const id = String(aircraftId || '').trim();
    if (!id) return null;
    return AIRCRAFT_NODE_OVERRIDES.find((entry) => String(entry?.aircraftId || '').trim() === id) || null;
  }

  function getAircraftOverrideSets(aircraftId) {
    const entry = getAircraftOverrideEntry(aircraftId);
    const ignore = new Set((entry?.ignoreNodes || []).map((n) => nodeNameKey(n)).filter(Boolean));
    const gear = new Set((entry?.gearNodes || []).map((n) => nodeNameKey(n)).filter(Boolean));
    const hideNodes = new Set((entry?.hideNodes || []).map((n) => nodeNameKey(n)).filter(Boolean));
    return { ignore, gear, hideNodes };
  }

  function getNodeOverrideMode(aircraftId, name) {
    const key = nodeNameKey(name);
    if (!key) return 'default';
    const sets = getAircraftOverrideSets(aircraftId);
    if (sets.ignore.has(key)) return 'ignore';
    if (sets.hideNodes.has(key)) return 'hide';
    if (sets.gear.has(key)) return 'gear';
    return 'default';
  }

  function classifyNodeNameForAircraft(name, aircraftId) {
    const base = classifyNodeName(name);
    const mode = getNodeOverrideMode(aircraftId, name);
    if (mode === 'ignore') {
      return {
        ...base,
        gear: false,
        ignored: true,
        overrideMode: 'ignore'
      };
    }
    if (mode === 'gear') {
      return {
        ...base,
        gear: true,
        ignored: false,
        overrideMode: 'gear'
      };
    }
    if (mode === 'hide') {
      return {
        ...base,
        hideNodes: true,
        ignored: false,
        overrideMode: 'hide'
      };
    }
    return {
      ...base,
      ignored: false,
      overrideMode: 'default'
    };
  }

  function collectPartNodeNames(ac) {
    const parts = ac?.definition?.parts || [];
    const out = [];
    const seen = new Set();
    for (const p of parts) {
      const a = String(p?.name || '').trim();
      const b = String(p?.node || '').trim();
      if (a) {
        const k = a.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          out.push(a);
        }
      }
      if (b) {
        const k = b.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          out.push(b);
        }
      }
    }
    return out;
  }

  function readAnimState(ac) {
    const av = ac?.animationValues || geofs?.animation?.values || {};
    const pick = (...keys) => {
      for (const k of keys) {
        if (av && av[k] != null && Number.isFinite(Number(av[k]))) return Number(av[k]);
      }
      return null;
    };
    return {
      gear: pick('gear', 'landingGear', 'gearPosition', 'landing_gear'),
      flaps: pick('flaps', 'flapsValue', 'flapsPosition', 'flaps_value'),
      spoilers: pick('spoilers', 'spoiler', 'spoilersPosition'),
      airbrake: pick('airbrake', 'airBrake', 'airbrakes')
    };
  }

  function buildNodeDiscoverySummary(ac, model) {
    const aircraftId = String(ac?.id ?? ac?.aircraftRecord?.id ?? '');
    const combined = [];
    const seen = new Set();
    const add = (name) => {
      const s = String(name || '').trim();
      if (!s) return;
      const key = s.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      combined.push(s);
    };

    for (const n of collectPartNodeNames(ac)) add(n);
    for (const n of collectModelNodeNames(model)) add(n);

    const gear = [];
    const wheels = [];
    const doors = [];
    const hideNodes = [];
    const other = [];
    const ignored = [];

    for (const name of combined) {
      const c = classifyNodeNameForAircraft(name, aircraftId);
      if (c.ignored) {
        ignored.push(name);
        continue;
      }
      if (c.hideNodes) hideNodes.push(name);
      if (c.doors) doors.push(name);
      if (c.wheels) wheels.push(name);
      if (c.gear) gear.push(name);
      if (!c.hideNodes && !c.doors && !c.wheels && !c.gear) other.push(name);
    }

    return {
      total: combined.length,
      gear,
      wheels,
      doors,
      hideNodes,
      other,
      ignored
    };
  }

  function collectModelNodeNames(model) {
    const out = new Set();
    if (!model) return [];

    const tryAdd = (name) => {
      if (!name) return;
      out.add(String(name));
    };

    try {
      const byName = model._nodesByName || model._runtime?.nodesByName;
      if (byName && typeof byName === 'object') {
        for (const k of Object.keys(byName)) tryAdd(k);
      }
    } catch { }

    try {
      const arr = model._runtime?.nodes || model._nodes;
      if (Array.isArray(arr)) {
        for (const n of arr) {
          tryAdd(n?.name);
          tryAdd(n?._name);
          tryAdd(n?.id);
        }
      }
    } catch { }

    return [...out];
  }

  function buildNodeCache(track) {
    if (!track?._ghost?._model?.ready) return false;
    if (track._nodeCache?.ready) return true;

    const model = track._ghost._model;
    const parts = geofs?.aircraft?.instance?.definition?.parts || [];
    const all = [];
    const gear = [];
    const wheels = [];
    const doors = [];
    const hideNodes = [];
    const seen = new Set();

    const pushNode = (node, nameHint = '') => {
      if (!node) return;
      const key = String(node?.name || node?._name || node?.id || nameHint || '').toLowerCase();
      if (key && seen.has(key)) return;
      if (key) seen.add(key);

      all.push(node);

      const nodeName = String(nameHint || node?.name || node?._name || node?.id || '');
      const c = classifyNodeNameForAircraft(nodeName, track?.aircraftId);
      if (c.ignored) return;
      if (c.hideNodes) hideNodes.push(node);
      if (c.doors) doors.push(node);
      if (c.wheels) wheels.push(node);
      if (c.gear) gear.push(node);
    };

    for (const p of parts) {
      const nm = String(p?.name || p?.node || '');
      if (!nm) continue;
      const node = getNode(model, nm);
      pushNode(node, nm);
    }

    const runtimeNames = collectModelNodeNames(model);
    for (const nm of runtimeNames) {
      if (!nm) continue;
      const node = getNode(model, nm);
      pushNode(node, nm);
    }

    track._nodeCache = { ready: true, all, gear, wheels, doors, hideNodes };

    return true;
  }

  function setCategoryVisible(track, cat, visible) {
    if (!buildNodeCache(track)) return;
    const arr = track._nodeCache?.[cat] || [];
    for (const n of arr) {
      try { n.show = !!visible; } catch { }
    }
  }

  function hideConfiguredNodes(track) {
    if (!track?._ghost?._model?.ready) return;
    setCategoryVisible(track, 'hideNodes', false);
  }

  function applyGearState(track, isUp) {
    if (!buildNodeCache(track)) {
      return;
    }
    if (isUp) {
      setCategoryVisible(track, 'doors', false);
      setCategoryVisible(track, 'wheels', false);
      setCategoryVisible(track, 'gear', false);
    } else {
      setCategoryVisible(track, 'doors', true);
      setCategoryVisible(track, 'gear', true);
      setCategoryVisible(track, 'wheels', true);
    }
    // Keep this last so always-hidden nodes never reappear after gear visibility changes.
    hideConfiguredNodes(track);
  }

  function applyGhostGearStateWhenReady(track, isUp, attempt = 0) {
    if (!track?._play?.playing) return;
    if (!track?._ghost?._model?.ready) {
      if (attempt >= 80) return;
      setTimeout(() => applyGhostGearStateWhenReady(track, isUp, attempt + 1), 50);
      return;
    }
    applyGearState(track, !!isUp);
    hideConfiguredNodes(track);
    track._lastGearUp = !!isUp;
  }

  function readGearUp(ac) {
    const av = ac?.animationValues || geofs?.animation?.values;
    if (!av) return false;
    const raw = (
      av.gear ??
      av.landingGear ??
      av.gearPosition ??
      av.landing_gear
    );
    const g = Number(raw);
    return Number.isFinite(g) ? g > 0.5 : false;
  }

  function gearUpAtIndex(track, idx) {
    const events = Array.isArray(track?.gearEvents) ? track.gearEvents : [];
    const tNow = Number(idx);
    if (!Number.isFinite(tNow) || !events.length) return false;

    let found = false;
    let bestT = -Infinity;
    let bestUp = false;

    for (const e of events) {
      const te = Number(e?.t);
      if (!Number.isFinite(te) || te > tNow) continue;
      if (!found || te >= bestT) {
        found = true;
        bestT = te;
        bestUp = !!e?.up;
      }
    }

    return found ? bestUp : false;
  }

  function nodeCategoryFromName(name, aircraftId = '') {
    const c = classifyNodeNameForAircraft(name, aircraftId);
    if (c.ignored) return 'other';
    if (c.hideNodes) return 'hideNodes';
    if (c.doors) return 'doors';
    if (c.wheels) return 'wheels';
    if (c.gear) return 'gear';
    return 'other';
  }

  function getTrackNodeDebugItems(track) {
    const model = track?._ghost?._model;
    if (!model) return [];
    const names = collectModelNodeNames(model);
    const out = [];
    const seen = new Set();
    for (const raw of names) {
      const name = String(raw || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const node = getNode(model, name);
      const overrideMode = getNodeOverrideMode(track?.aircraftId, name);
      out.push({
        name,
        category: nodeCategoryFromName(name, track?.aircraftId),
        visible: node ? node.show !== false : true,
        found: !!node,
        overrideMode
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  function setTrackNodeVisibility(trackId, nodeName, visible) {
    const tr = tracks.find((t) => String(t?.id || '') === String(trackId || ''));
    const model = tr?._ghost?._model;
    if (!tr || !model || !nodeName) return false;
    const node = getNode(model, nodeName);
    if (!node) return false;
    try {
      node.show = !!visible;
      return true;
    } catch {
      return false;
    }
  }

  function setTrackCategoryVisibility(trackId, category, visible) {
    const tr = tracks.find((t) => String(t?.id || '') === String(trackId || ''));
    if (!tr) return false;

    if (category === 'hideNodes' || category === 'doors' || category === 'wheels' || category === 'gear') {
      setCategoryVisible(tr, category, visible);
      return true;
    }

    if (category !== 'other') return false;
    const model = tr?._ghost?._model;
    if (!model) return false;
    const names = collectModelNodeNames(model);
    for (const raw of names) {
      const name = String(raw || '').trim();
      if (!name || nodeCategoryFromName(name, tr?.aircraftId) !== 'other') continue;
      const node = getNode(model, name);
      if (!node) continue;
      try { node.show = !!visible; } catch { }
    }
    return true;
  }

  function getPlaybackDebugData() {
    const playing = tracks.filter((t) => t?._play?.playing);
    return playing.map((tr) => {
      const items = getTrackNodeDebugItems(tr);
      const groups = { hideNodes: [], doors: [], wheels: [], gear: [], other: [] };
      for (const item of items) {
        const key = groups[item.category] ? item.category : 'other';
        groups[key].push(item);
      }
      return {
        id: tr.id,
        name: tr.name,
        aircraftId: String(tr.aircraftId || ''),
        callsign: sanitizeCallsign(tr.callsign || ''),
        modelUrl: tr.modelUrl || '',
        modelReady: !!tr?._ghost?._model?.ready,
        totalParts: items.length,
        groups,
        overrideConfig: {
          ignoreNodes: [...(getAircraftOverrideEntry(tr.aircraftId)?.ignoreNodes || [])],
          gearNodes: [...(getAircraftOverrideEntry(tr.aircraftId)?.gearNodes || [])],
          hideNodes: [...(getAircraftOverrideEntry(tr.aircraftId)?.hideNodes || [])]
        }
      };
    });
  }

  function emitRecorderDebugEvent() {
    try {
      window.dispatchEvent(new CustomEvent('fr:ui-updated'));
    } catch { }
  }

  function getTrackPlaybackState(track) {
    if (!track?._play?.playing) return 'IDLE';
    if (track._play.paused) return 'PAUSED';
    return 'PLAYING';
  }

  function resolveApiTracks(trackIds, options = {}) {
    const playableOnly = options.playableOnly !== false;
    const source = playableOnly ? tracks.filter((t) => t.lla.length) : tracks.slice();
    if (trackIds == null) return source;

    const ids = Array.isArray(trackIds) ? trackIds : [trackIds];
    const idSet = new Set(ids.map((id) => String(id || '').trim()).filter(Boolean));
    if (!idSet.size) return [];
    return source.filter((t) => idSet.has(t.id));
  }

  function getPlaybackStateSnapshot(trackIds) {
    const targetTracks = resolveApiTracks(trackIds, { playableOnly: true });
    return {
      state: playState,
      tracks: targetTracks.map((tr) => ({
        id: tr.id,
        name: tr.name,
        playbackState: getTrackPlaybackState(tr),
        idx: tr._play.idx,
        sampleCount: tr.lla.length,
        sampleMs: tr.sampleMs
      }))
    };
  }

  function startPlaybackFromApi(trackIds) {
    if (recordState !== 'IDLE') {
      return { ok: false, reason: 'RECORDING_ACTIVE' };
    }

    const targetTracks = resolveApiTracks(trackIds, { playableOnly: true });
    if (!targetTracks.length) {
      return { ok: false, reason: 'NO_TRACKS' };
    }

    const t0 = now();
    for (const tr of targetTracks) {
      if (!tr._play.playing) startPlaybackAt(tr, t0);
      else if (tr._play.paused) pausePlayback(tr, false);
    }
    if (targetTracks[0]) {
      renderMessageTimeline(targetTracks[0]);
    }
    updateUi();
    return {
      ok: true,
      state: playState,
      trackIds: targetTracks.map((t) => t.id)
    };
  }

  function pausePlaybackFromApi(trackIds) {
    const targetTracks = resolveApiTracks(trackIds, { playableOnly: true });
    if (!targetTracks.length) {
      return { ok: false, reason: 'NO_TRACKS' };
    }

    let changed = 0;
    for (const tr of targetTracks) {
      if (tr._play.playing && !tr._play.paused) {
        pausePlayback(tr, true);
        changed++;
      }
    }
    updateUi();
    return {
      ok: changed > 0,
      changed,
      state: playState,
      trackIds: targetTracks.map((t) => t.id)
    };
  }

  function stopPlaybackFromApi(trackIds) {
    const targetTracks = resolveApiTracks(trackIds, { playableOnly: true });
    if (!targetTracks.length) {
      return { ok: false, reason: 'NO_TRACKS' };
    }

    let changed = 0;
    for (const tr of targetTracks) {
      if (tr._play.playing) {
        stopPlayback(tr);
        changed++;
      }
    }
    updateUi();
    return {
      ok: changed > 0,
      changed,
      state: playState,
      trackIds: targetTracks.map((t) => t.id)
    };
  }

  function startRecordingFromApi() {
    if (recordState !== 'IDLE') {
      return { ok: false, reason: 'ALREADY_RECORDING', state: recordState };
    }
    startRecordingWithSelectedPlaybacks();
    return { ok: recordState === 'RECORDING', state: recordState };
  }

  function stopRecordingFromApi() {
    if (recordState !== 'RECORDING') {
      return { ok: false, reason: 'NOT_RECORDING', state: recordState };
    }
    stopRecording();
    return { ok: true, state: recordState };
  }

  function getRecorderStateSnapshot(trackIds) {
    return {
      version: VERSION,
      recordState,
      playState,
      recording: {
        state: recordState,
        isRecording: recordState === 'RECORDING'
      },
      playback: getPlaybackStateSnapshot(trackIds)
    };
  }

  function exposeDebugApi() {
    window.FlightRecorder = window.FlightRecorder || {};
    window.FlightRecorder.api = {
      getVersion: () => VERSION,
      getState: (trackIds) => getRecorderStateSnapshot(trackIds),
      recording: {
        start: () => startRecordingFromApi(),
        stop: () => stopRecordingFromApi(),
        getState: () => ({ state: recordState, isRecording: recordState === 'RECORDING' })
      },
      playback: {
        start: (trackIds) => startPlaybackFromApi(trackIds),
        pause: (trackIds) => pausePlaybackFromApi(trackIds),
        stop: (trackIds) => stopPlaybackFromApi(trackIds),
        getState: (trackIds) => getPlaybackStateSnapshot(trackIds)
      }
    };
    window.FlightRecorder.debugApi = {
      version: VERSION,
      getPanelElement: () => document.getElementById(FR_PANEL_ID),
      getPlaybackDebugData,
      getAircraftNodeOverrideConfig: (aircraftId) => {
        const entry = getAircraftOverrideEntry(aircraftId);
        return {
          aircraftId: String(aircraftId || ''),
          ignoreNodes: [...(entry?.ignoreNodes || [])],
          gearNodes: [...(entry?.gearNodes || [])],
          hideNodes: [...(entry?.hideNodes || [])]
        };
      },
      setTrackNodeVisibility,
      setTrackCategoryVisibility,
      hideTrackHideNodes: (trackId) => {
        const tr = tracks.find((t) => String(t?.id || '') === String(trackId || ''));
        if (!tr) return false;
        hideConfiguredNodes(tr);
        return true;
      },
      hideTrackLadder: (trackId) => {
        const tr = tracks.find((t) => String(t?.id || '') === String(trackId || ''));
        if (!tr) return false;
        hideConfiguredNodes(tr);
        return true;
      }
    };
  }

  function cloneLiveryId(value) {
    if (value == null) return null;
    if (typeof value === 'object') {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        return null;
      }
    }
    return value;
  }

  function liverySig(value) {
    if (value == null) return '';
    if (typeof value === 'object') {
      const url = String(value.url || '').trim();
      const idx = Number(value.idx);
      return `va:${url}|${Number.isFinite(idx) ? idx : -1}`;
    }
    const n = Number(value);
    return Number.isFinite(n) ? `id:${n}` : '';
  }

  function liverySnapshotSig(snapshot) {
    const textures = Array.isArray(snapshot?.textures) ? snapshot.textures : [];
    if (!textures.length) return '';
    const first = textures[0] || {};
    const last = textures[textures.length - 1] || {};
    return `snap:${textures.length}:${Number(first.index) || 0}:${String(first.url || '')}:${Number(last.index) || 0}:${String(last.url || '')}`;
  }

  function readCurrentLiveryId(ac) {
    return cloneLiveryId(ac?.liveryId ?? null);
  }

  function readTextureUrl(tex) {
    const candidates = [
      tex?._source?._url,
      tex?._url,
      tex?.url,
      tex?._image?._url,
      tex?._image?.src,
      tex?.source?.url
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return '';
  }

  function readCurrentLiverySnapshot(ac) {
    const textures = ac?.object3d?.model?._model?._rendererResources?.textures;
    if (!Array.isArray(textures) || !textures.length) return null;
    const out = [];
    for (let i = 0; i < textures.length; i++) {
      const url = readTextureUrl(textures[i]);
      if (!url) continue;
      out.push({ index: i, url });
    }
    return out.length ? { textures: out } : null;
  }

  function liveryAtIndex(track, idx) {
    const ev = track?.liveryEvents || [];
    let current = null;
    for (let i = 0; i < ev.length; i++) {
      if ((ev[i]?.t ?? -1) > idx) break;
      current = cloneLiveryId(ev[i]?.id ?? null);
    }
    return current;
  }

  function liverySnapshotAtIndex(track, idx) {
    const ev = track?.liveryEvents || [];
    let current = null;
    for (let i = 0; i < ev.length; i++) {
      if ((ev[i]?.t ?? -1) > idx) break;
      const snap = ev[i]?.snapshot;
      current = snap ? JSON.parse(JSON.stringify(snap)) : null;
    }
    return current;
  }

  function getLiverySelectorAircraftEntry(track) {
    const ls = window.LiverySelector;
    const acId = String(track?.aircraftId || '');
    return ls?.liveryobj?.aircrafts?.[acId] || null;
  }

  function makeUniqueGhostModelUrl(track) {
    const base = String(track?.modelUrl || '');
    if (!base) return base;
    const sep = base.includes('?') ? '&' : '?';
    const token = encodeURIComponent(`${track?.id || 'ghost'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    return `${base}${sep}frghost=${token}`;
  }

  async function getVALivery(track, liveryRef) {
    const url = String(liveryRef?.url || '').trim();
    const idx = Number(liveryRef?.idx);
    if (!url || !Number.isFinite(idx) || idx < 0) return null;

    const cache = track?._livery?.vaCache || Object.create(null);
    if (!cache[url]) {
      cache[url] = fetch(url).then((r) => r.json()).catch(() => null);
      if (track?._livery) track._livery.vaCache = cache;
    }
    const airline = await cache[url];
    const acId = String(track?.aircraftId || '');
    const ac = airline?.aircrafts?.[acId];
    const livery = ac?.liveries?.[idx];
    if (!livery) return null;
    return { livery, source: airline };
  }

  function changeGhostModelTexture(track, textureUrl, index, applyRunId = 0) {
    const ghost = track?._ghost;
    const model = ghost?._model;
    if (!ghost || !model || !textureUrl || !Number.isFinite(Number(index))) return;

    const rendererTex = model?._rendererResources?.textures?.[index];
    const width = Number(rendererTex?._width) || 0;
    const height = Number(rendererTex?._height) || 0;

    // Use per-instance texture path (same strategy as LiverySelector multiplayer)
    // so we don't mutate shared model textures used by the player's own aircraft.
    const applyTextureData = (dataUrl) => {
      if (applyRunId && Number(track?._livery?.activeApplyRunId || 0) !== Number(applyRunId)) {
        return false;
      }

      let didApply = false;
      let used = '';
      const failed = [];
      const hasGhostChange = typeof ghost?.changeTexture === 'function';
      const hasModelChange = typeof model?.changeTexture === 'function';
      const protoChange = geofs?.api?.Model?.prototype?.changeTexture;
      const hasProtoChange = typeof protoChange === 'function';
      const hasApiChange = typeof geofs?.api?.changeModelTexture === 'function';

      const tryApply = (label, fn) => {
        if (didApply) return;
        if (applyRunId && Number(track?._livery?.activeApplyRunId || 0) !== Number(applyRunId)) return;
        try {
          fn();
          didApply = true;
          used = label;
        } catch {
          failed.push(label);
        }
      };

      if (hasGhostChange) {
        tryApply('ghost_obj', () => ghost.changeTexture(dataUrl, { index }));
        tryApply('ghost_num', () => ghost.changeTexture(dataUrl, index));
      }
      if (hasModelChange) {
        tryApply('model_obj', () => model.changeTexture(dataUrl, { index }));
        tryApply('model_num', () => model.changeTexture(dataUrl, index));
      }
      if (hasProtoChange) {
        tryApply('proto_num', () => protoChange.call(ghost, dataUrl, index, ghost));
        tryApply('proto_obj', () => protoChange.call(ghost, dataUrl, { index }, ghost));
      }
      if (hasApiChange) {
        tryApply('api_num', () => geofs.api.changeModelTexture(model, dataUrl, index));
        tryApply('api_obj', () => geofs.api.changeModelTexture(model, dataUrl, { index }));
      }

      return didApply;
    };

    Cesium.Resource.fetchImage({ url: textureUrl })
      .then((img) => {
        if (applyRunId && Number(track?._livery?.activeApplyRunId || 0) !== Number(applyRunId)) return;
        const canvas = document.createElement('canvas');
        canvas.width = width || img.width || 1024;
        canvas.height = height || img.height || 1024;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        applyTextureData(dataUrl);
      })
      .catch(() => {
        console.warn(`Failed to load livery texture from ${textureUrl}`);
      });
  }

  function applyGhostLiverySnapshot(track, snapshot, applyRunId = 0) {
    const textures = Array.isArray(snapshot?.textures) ? snapshot.textures : [];
    if (!textures.length) return false;
    if (!track?._ghost?._model?.ready) return false;

    let applied = false;
    for (const item of textures) {
      const idx = Number(item?.index);
      const url = String(item?.url || '').trim();
      if (!url || !Number.isFinite(idx)) continue;
      changeGhostModelTexture(track, url, idx, applyRunId);
      applied = true;
    }
    return applied;
  }

  function applyGhostMaterial(model, mat) {
    if (!model || !mat?.name) return;
    const key = Object.keys(mat).find((k) => k !== 'name');
    const v = mat?.[key];
    if (!key || !Array.isArray(v) || v.length < 3) return;
    try {
      model.getMaterial(mat.name).setValue(key, new Cesium.Cartesian4(v[0], v[1], v[2], 1.0));
    } catch {
      // ignore material failures
    }
  }

  async function applyTrackLivery(track, liveryId, snapshot) {
    const reqSig = liverySig(liveryId);
    const runId = track?._livery
      ? (track._livery.applyRunId = Number(track._livery.applyRunId || 0) + 1)
      : 0;
    if (track?._livery) track._livery.activeApplyRunId = runId;

    if (!track?._ghost?._model?.ready) {
      return false;
    }

    if (applyGhostLiverySnapshot(track, snapshot, runId)) {
      return true;
    }

    const entry = getLiverySelectorAircraftEntry(track);
    if (!entry) {
      return false;
    }

    let livery = null;
    if (typeof liveryId === 'object' && liveryId) {
      const va = await getVALivery(track, liveryId);
      livery = va?.livery || null;
    } else {
      const idNum = Number(liveryId);
      if (!Number.isFinite(idNum)) {
        return false;
      }
      const idx = idNum >= LIVERY_ID_OFFSET ? idNum - LIVERY_ID_OFFSET : idNum;
      livery = entry?.liveries?.[idx] || null;
    }
    if (!livery) {
      return false;
    }

    const indices = Array.isArray(entry.index) ? entry.index : [];
    const textures = Array.isArray(livery.texture) ? livery.texture : [];
    const mats = livery.materials || {};
    const model = track._ghost._model;

    const applyByIndex = (skipModelIndices) => {
      let ops = 0;
      const touchedModelIndices = new Set();
      for (let i = 0; i < textures.length; i++) {
        const tx = textures[i];
        if (tx && typeof tx === 'object' && tx.material != null) {
          const mat = mats?.[tx.material];
          if (mat) {
            applyGhostMaterial(model, mat);
            ops++;
          }
          continue;
        }
        if (typeof tx !== 'string' || !tx) continue;
        const modelIndex = Number(indices[i]);
        if (!Number.isFinite(modelIndex)) continue;
        if (skipModelIndices?.has(modelIndex)) continue;
        changeGhostModelTexture(track, tx, modelIndex, runId);
        ops++;
        touchedModelIndices.add(modelIndex);
      }
      return { ops, touchedModelIndices };
    };

    const indexRes = applyByIndex();
    const ok = indexRes.ops > 0;
    return ok;
  }

  function requestApplyTrackLivery(track, liveryId, snapshot) {
    if (!track?._livery || track._livery.applying) return;
    const reqSig = liverySig(liveryId);
    if (reqSig && track._livery.appliedSig === reqSig) return;
    track._livery.applying = true;
    Promise.resolve(applyTrackLivery(track, liveryId, snapshot))
      .then((ok) => {
        if (!track?._livery) return;
        if (!ok) return;
        track._livery.appliedSig = reqSig || null;
        track._livery.resetSig = reqSig || null;
        if (!reqSig || track._livery.pendingSig === reqSig) {
          track._livery.pendingId = null;
          track._livery.pendingSnapshot = null;
          track._livery.pendingSig = null;
        }
      })
      .catch(() => { })
      .finally(() => {
        if (track?._livery) track._livery.applying = false;
      });
  }

  function applyTrackLiveryWhenReady(track, liv, snap, sig, attempt = 0) {
    if (!track?._play?.playing) return;
    const modelReady = !!track?._ghost?._model?.ready;
    if (modelReady) {
      requestApplyTrackLivery(track, liv, snap);
      return;
    }
    if (attempt >= 80) {
      return;
    }
    setTimeout(() => applyTrackLiveryWhenReady(track, liv, snap, sig, attempt + 1), 50);
  }

  function applyCurrentLiveryForTrack(track) {
    if (!track?._play?.playing) return false;

    const idx = clamp(Math.floor(track?._play?.idx || 0), 0, Math.max(0, (track?.lla?.length || 1) - 1));
    const liv = liveryAtIndex(track, idx);
    const snap = liverySnapshotAtIndex(track, idx);
    const sig = liverySig(liv);

    if (track._livery) {
      track._livery.appliedSig = null;
      track._livery.pendingId = liv;
      track._livery.pendingSnapshot = snap;
      track._livery.pendingSig = sig;
    }

    if (liv == null && !snap) {
      return false;
    }

    requestApplyTrackLivery(track, liv, snap);
    return true;
  }

  function resetThenApplyLiveryForTrack(track) {
    if (!track?._play?.playing) return false;

    const idx = clamp(Math.floor(track?._play?.idx || 0), 0, Math.max(0, (track?.lla?.length || 1) - 1));
    const liv = liveryAtIndex(track, idx);
    const snap = liverySnapshotAtIndex(track, idx);
    const sig = liverySig(liv);

    resetGhostForNewLivery(track);

    if (track._livery) {
      track._livery.appliedSig = null;
      track._livery.resetSig = null;
      track._livery.pendingId = liv;
      track._livery.pendingSnapshot = snap;
      track._livery.pendingSig = sig;
    }

    if (liv == null && !snap) {
      return false;
    }

    applyTrackLiveryWhenReady(track, liv, snap, sig);
    return true;
  }

  /* ---------- Recording ---------- */
  function canStartRecording() {
    return recordState === 'IDLE';
  }

  function readLivePose(ac, base) {
    const lla = [ac.llaLocation[0], ac.llaLocation[1], ac.llaLocation[2]];
    const htr = [ac.htr[0], ac.htr[1], ac.htr[2]];
    const dx = (lla[1] - base.lon0) * base.mLon;
    const dy = (lla[0] - base.lat0) * base.mLat;
    return { lla, htr, xy: [dx, dy, lla[2]] };
  }

  function interpolatePose(a, b, f) {
    if (!a) return b;
    if (!b) return a;
    return {
      lla: [
        lerp(a.lla[0], b.lla[0], f),
        a.lla[1] + angleDeltaDeg(a.lla[1], b.lla[1]) * f,
        lerp(a.lla[2], b.lla[2], f)
      ],
      htr: [
        lerpAngleDeg(a.htr[0], b.htr[0], f),
        lerpAngleDeg(a.htr[1], b.htr[1], f),
        lerpAngleDeg(a.htr[2], b.htr[2], f)
      ],
      xy: [
        lerp(a.xy[0], b.xy[0], f),
        lerp(a.xy[1], b.xy[1], f),
        lerp(a.xy[2], b.xy[2], f)
      ]
    };
  }

  function applyPrecisionVisualFilter(track, idxFloat) {
    const n = track.lla.length;
    if (n < 2) {
      return {
        lla: track.lla[0],
        htr: track.htr[0]
      };
    }

    const strength01 = clamp(Number(ultraStrength) || 0, 0, 100) / 100;
    if (strength01 <= 0) {
      const i1 = clamp(Math.floor(idxFloat), 0, n - 1);
      const i2 = clamp(i1 + 1, 0, n - 1);
      const f = clamp(idxFloat - i1, 0, 1);
      const outL = track._pool.tmpA;
      interpLLA(track.lla[i1], track.lla[i2], f, outL);
      return {
        lla: [outL[0], outL[1], outL[2]],
        htr: [
          lerpAngleDeg(track.htr[i1][0], track.htr[i2][0], f),
          lerpAngleDeg(track.htr[i1][1], track.htr[i2][1], f),
          lerpAngleDeg(track.htr[i1][2], track.htr[i2][2], f)
        ]
      };
    }

    // Unieke cache key op basis van track-eigenschappen en de gekozen sterkte
    const key = `${n}|${Math.max(1, track.sampleMs)}|ButterQuat_${Math.round(strength01 * 1000)}`;

    if (!track._precision || track._precision.key !== key) {
      // BEREKENING VAN BUTTERWORTH COEFFICIENTEN
      const fs = 1000 / Math.max(1, track.sampleMs);
      const fc = lerp(4.0, 0.4, strength01); 

      const omega = 2.0 * Math.PI * fc / fs;
      const tanOmega = Math.tan(omega / 2.0);
      const tanSq = tanOmega * tanOmega;
      const sqrt2 = Math.sqrt(2.0);

      const denom = 1.0 + sqrt2 * tanOmega + tanSq;
      const b0 = tanSq / denom;
      const b1 = 2.0 * b0;
      const b2 = b0;
      const a1 = 2.0 * (tanSq - 1.0) / denom;
      const a2 = (1.0 - sqrt2 * tanOmega + tanSq) / denom;

      const rawX = new Float64Array(n);
      const rawY = new Float64Array(n);
      const rawZ = new Float64Array(n);
      const qW = new Float64Array(n);
      const qX = new Float64Array(n);
      const qY = new Float64Array(n);
      const qZ = new Float64Array(n);

      const toRad = Math.PI / 180;
      const toDeg = 180 / Math.PI;

      for (let i = 0; i < n; i++) {
        rawX[i] = track.xy[i][0];
        rawY[i] = track.xy[i][1];
        rawZ[i] = track.xy[i][2];

        const yaw = track.htr[i][0] * toRad;
        const pitch = track.htr[i][1] * toRad;
        const roll = track.htr[i][2] * toRad;

        const cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
        const cp = Math.cos(pitch * 0.5), sp = Math.sin(pitch * 0.5);
        const cr = Math.cos(roll * 0.5), sr = Math.sin(roll * 0.5);

        qW[i] = cr * cp * cy + sr * sp * sy;
        qX[i] = sr * cp * cy - cr * sp * sy;
        qY[i] = cr * sp * cy + sr * cp * sy;
        qZ[i] = cr * cp * sy - sr * sp * cy;
      }

      function filtfilt(arr) {
        const forward = new Float64Array(n);
        const output = new Float64Array(n);

        let x1 = arr[0], x2 = arr[0];
        let y1 = arr[0], y2 = arr[0];
        for (let i = 0; i < n; i++) {
          const x = arr[i];
          const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
          forward[i] = y;
          x2 = x1; x1 = x;
          y2 = y1; y1 = y;
        }

        let r1 = forward[n - 1], r2 = forward[n - 1];
        let z1 = forward[n - 1], z2 = forward[n - 1];
        for (let i = n - 1; i >= 0; i--) {
          const r = forward[i];
          const z = b0 * r + b1 * r1 + b2 * r2 - a1 * z1 - a2 * z2;
          output[i] = z;
          r2 = r1; r1 = r;
          z2 = z1; z1 = z;
        }
        return output;
      }

      const smX = filtfilt(rawX);
      const smY = filtfilt(rawY);
      const smZ = filtfilt(rawZ);
      const smQW = filtfilt(qW);
      const smQX = filtfilt(qX);
      const smQY = filtfilt(qY);
      const smQZ = filtfilt(qZ);

      const smXY = new Array(n);
      const smLLA = new Array(n);
      const smHTR = new Array(n);

      for (let i = 0; i < n; i++) {
        smXY[i] = [smX[i], smY[i], smZ[i]];
        smLLA[i] = [
          track.base.lat0 + (smY[i] / track.base.mLat),
          track.base.lon0 + (smX[i] / track.base.mLon),
          smZ[i]
        ];

        let qw = smQW[i], qx = smQX[i], qy = smQY[i], qz = smQZ[i];
        const mag = Math.sqrt(qw*qw + qx*qx + qy*qy + qz*qz);
        if (mag > 1e-6) { qw /= mag; qx /= mag; qy /= mag; qz /= mag; }

        const sinp = 2 * (qw * qy - qz * qx);
        const pitch = Math.abs(sinp) >= 1 ? (Math.PI / 2) * Math.sign(sinp) : Math.asin(sinp);
        
        const siny_cosp = 2 * (qw * qz + qx * qy);
        const cosy_cosp = 1 - 2 * (qy * qy + qz * qz);
        let heading = Math.atan2(siny_cosp, cosy_cosp) * toDeg;
        if (heading < 0) heading += 360;

        const sinr_cosp = 2 * (qw * qx + qy * qz);
        const cosr_cosp = 1 - 2 * (qx * qx + qy * qy); // Typfout hersteld: qx * qx in plaats van qx * x
        const roll = Math.atan2(sinr_cosp, cosr_cosp) * toDeg;

        smHTR[i] = [heading, pitch * toDeg, roll];
      }

      track._precision = { key, lla: smLLA, htr: smHTR, xy: smXY };
    }

    const srcL = track._precision.lla;
    const srcH = track._precision.htr;
    const i1 = clamp(Math.floor(idxFloat), 0, n - 1);
    const i2 = clamp(i1 + 1, 0, n - 1);
    const f = clamp(idxFloat - i1, 0, 1);

    const outL = track._pool.tmpC;
    interpLLA(srcL[i1], srcL[i2], f, outL);

    return {
      lla: [outL[0], outL[1], outL[2]],
      htr: [
        lerpAngleDeg(srcH[i1][0], srcH[i2][0], f),
        lerpAngleDeg(srcH[i1][1], srcH[i2][1], f),
        lerpAngleDeg(srcH[i1][2], srcH[i2][2], f)
      ]
    };
  }

  function startRecordingInternal(t0) {
    const ac = geofs?.aircraft?.instance;
    if (!ac) return alert('No active aircraft.');
    const modelUrl = ac?.object3d?.model?._model?._resource?.url;
    if (!modelUrl) return alert('No model URL found.');

    const fallbackCallsign = sanitizeCallsign(geofs?.userRecord?.callsign || geofs?.callsign || '');
    const tr = makeTrackBase(ac, defaultSampleMs, recordCallsign || fallbackCallsign);
    initTrackRuntime(tr);
    tr.modelUrl = modelUrl;

    const liveModel = ac?.object3d?.model?._model;
    const summary = buildNodeDiscoverySummary(ac, liveModel);
    console.log(
      `Node discovery -> total=${summary.total}, gear=${summary.gear.length}, wheels=${summary.wheels.length}, doors=${summary.doors.length}, hideNodes=${summary.hideNodes.length}, other=${summary.other.length}, ignored=${summary.ignored.length}`
    );
    console.log('Node discovery gear candidates:', summary.gear);
    console.log('Node discovery wheel candidates:', summary.wheels);
    console.log('Node discovery door candidates:', summary.doors);
    if (summary.other.length) {
      console.log('Node discovery other (not auto-managed):', summary.other);
    }
    if (summary.ignored.length) {
      console.log('Node discovery ignored by aircraft override:', summary.ignored);
    }
    if (summary.hideNodes.length) {
      console.log('Node discovery always-hidden candidates:', summary.hideNodes);
    }

    tr._rec.startT = t0;
    tr._rec.lastT = t0;
    tr._rec.recording = true;
    const initialLivery = readCurrentLiveryId(ac);
    const initialSnapshot = readCurrentLiverySnapshot(ac);
    tr._rec.lastLiverySig = liverySig(initialLivery);
    tr.liveryEvents.push({ t: 0, id: initialLivery, snapshot: initialSnapshot });

    currentRec = tr;
    recordState = 'RECORDING';
    updateUi();
  }

  function startRecordingAt(t0) {
    if (!(recordState === 'IDLE' && (playState === 'IDLE' || playState === 'PLAYING'))) return;
    startRecordingInternal(t0);
  }

  function stopRecording() {
    if (!currentRec || recordState !== 'RECORDING') return;
    currentRec._rec.recording = false;

    const finalized = {
      orderId: currentRec.orderId,
      id: currentRec.id,
      name: currentRec.name,
      callsign: sanitizeCallsign(currentRec.callsign || ''),
      description: currentRec.description || '',
      createdAt: currentRec.createdAt,
      aircraftId: currentRec.aircraftId,
      modelUrl: currentRec.modelUrl,
      sampleMs: currentRec.sampleMs,
      base: currentRec.base,
      lla: currentRec.lla,
      htr: currentRec.htr,
      xy: currentRec.xy,
      gearEvents: currentRec.gearEvents,
      liveryEvents: currentRec.liveryEvents,
      messageEvents: currentRec.messageEvents || []
    };
    initTrackRuntime(finalized);
    tracks.push(finalized);

    currentRec = null;
    recordState = 'IDLE';
    void saveToIndexedDB();
    updateUi();
  }

  function recordFixedStep(track, dt) {
    const ac = geofs?.aircraft?.instance;
    if (!ac || !track?._rec?.recording) return;

    const rec = track._rec;
    const elapsedMs = Math.max(0, now() - rec.startT);
    const targetSamples = Math.floor(elapsedMs / Math.max(1, track.sampleMs)) + 1;
    rec.targetSamples = targetSamples;

    const missing = Math.min(
      Math.max(0, targetSamples - rec.sampleCount),
      MAX_RECORD_STEPS_PER_FRAME
    );
    if (!missing) return;

    const livePose = readLivePose(ac, track.base);
    const prevPose = rec.sampleCount > 0
      ? {
        lla: track.lla[rec.sampleCount - 1],
        htr: track.htr[rec.sampleCount - 1],
        xy: track.xy[rec.sampleCount - 1]
      }
      : null;

    for (let k = 1; k <= missing; k++) {
      const f = k / missing;
      const pose = prevPose ? interpolatePose(prevPose, livePose, f) : livePose;
      track.lla.push(pose.lla);
      track.htr.push(pose.htr);
      track.xy.push(pose.xy);

      const upNow = readGearUp(ac);
      if (rec.lastGearUp == null || rec.lastGearUp !== upNow) {
        track.gearEvents.push({ t: rec.sampleCount, up: !!upNow });
        rec.lastGearUp = upNow;
      }

      rec.sampleCount++;
    }
  }

  /* ---------- Playback ---------- */
  function getTrackCallsign(track) {
    return sanitizeCallsign(track?.callsign || '');
  }

  function destroyGhostCallsignLabel(track) {
    const entity = track?._ghostLabel;
    if (!entity) return;
    try {
      const viewer = geofs?.api?.viewer;
      viewer?.entities?.remove?.(entity);
    } catch {
      // ignore cleanup failures
    }
    track._ghostLabel = null;
  }

  function ensureGhostCallsignLabel(track, lla) {
    if (!showCallsign) {
      destroyGhostCallsignLabel(track);
      return;
    }
    const callsign = getTrackCallsign(track);
    if (!callsign) {
      destroyGhostCallsignLabel(track);
      return;
    }

    const viewer = geofs?.api?.viewer;
    const entities = viewer?.entities;
    if (!entities || !window.Cesium?.Cartesian3?.fromDegrees) return;

    const lat = Number(lla?.[0]);
    const lon = Number(lla?.[1]);
    const alt = Number(lla?.[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt)) return;

    const pos = window.Cesium.Cartesian3.fromDegrees(lon, lat, alt + 4);
    if (!track._ghostLabel) {
      try {
        track._ghostLabel = entities.add({
          position: pos,
          label: {
            text: callsign,
            fillColor: window.Cesium.Color.WHITE,
            outlineColor: window.Cesium.Color.BLACK,
            outlineWidth: 3,
            style: window.Cesium.LabelStyle.FILL_AND_OUTLINE,
            showBackground: false,
            backgroundColor: new window.Cesium.Color(0, 0, 0, 0.35),
            horizontalOrigin: window.Cesium.HorizontalOrigin.CENTER,
            verticalOrigin: window.Cesium.VerticalOrigin.TOP,
            pixelOffset: new window.Cesium.Cartesian2(0, -8),
            scale: 0.55,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          }
        });
      } catch {
        track._ghostLabel = null;
      }
    } else {
      try {
        track._ghostLabel.position = pos;
        if (track._ghostLabel.label) track._ghostLabel.label.text = callsign;
      } catch {
        // ignore runtime failures
      }
    }
  }

  function spawnGhost(track) {
    if (!track?.lla?.length || !track?.htr?.length) return null;
    try {
      track._nodeCache = { ready: false, all: [], gear: [], wheels: [], doors: [], hideNodes: [] };
      const ghostModelUrl = makeUniqueGhostModelUrl(track);
      const ghost = new geofs.api.Model(null, {
        url: ghostModelUrl,
        location: track.lla[0],
        rotation: track.htr[0]
      });
      track._ghost = ghost;
      track._ghostModelUrl = ghostModelUrl;
      return ghost;
    } catch {
      return null;
    }
  }

  function resetGhostForNewLivery(track) {
    if (!track) return;
    if (track._ghost) {
      try { track._ghost.destroy(); } catch { }
    }
    track._ghost = null;
    track._nodeCache = { ready: false, all: [], gear: [], wheels: [], doors: [], hideNodes: [] };
    ensureTrackState(track).gearUp = null;
    track._lastGearUp = null;
    spawnGhost(track);
  }

  function setGhostPose(track, lla, htr) {
    const g = track._ghost;
    if (!g?.setPositionOrientationAndScale) return;
    const L = track._pool.lla;
    const H = track._pool.htr;
    L[0] = lla[0];
    L[1] = lla[1];
    L[2] = lla[2];
    H[0] = htr[0];
    H[1] = htr[1];
    H[2] = htr[2];
    try { g.setPositionOrientationAndScale(L, H, null); } catch { }
    ensureGhostCallsignLabel(track, L);
  }

  function applyOwnAircraftGearState(isUp) {
    const v = isUp ? 1 : 0;
    let applied = false;
    const targets = [
      window.controls,
      geofs?.controls,
      geofs?.aircraft?.instance?.controls
    ];
    for (const tgt of targets) {
      if (!tgt?.gear) continue;
      try {
        tgt.gear.position = v;
        if ('target' in tgt.gear) tgt.gear.target = v;
        applied = true;
      } catch { }
    }
    return applied;
  }

  function ensureTrackState(track) {
    if (!track) return { mode: 'ghost', gearUp: null };
    if (!track._state || typeof track._state !== 'object') {
      track._state = { mode: track._pilotFollow ? 'pilot' : 'ghost', gearUp: null };
    }
    return track._state;
  }

  function isPilotMode(track) {
    return ensureTrackState(track).mode === 'pilot';
  }

  function setTrackMode(track, mode) {
    const st = ensureTrackState(track);
    st.mode = mode === 'pilot' ? 'pilot' : 'ghost';
    track._pilotFollow = st.mode === 'pilot';
  }

  function setTrackGearUp(track, up) {
    ensureTrackState(track).gearUp = !!up;
    track._lastGearUp = !!up;
    return !!up;
  }

  function syncTrackGearUp(track, idx, force = false) {
    const upNow = gearUpAtIndex(track, idx);
    const st = ensureTrackState(track);
    const changed = st.gearUp == null || st.gearUp !== upNow;
    if (force || changed) {
      st.gearUp = !!upNow;
      track._lastGearUp = !!upNow;
      return { upNow: !!upNow, changed: true };
    }
    return { upNow: !!upNow, changed: false };
  }

  function getTrackGearUp(track, idx) {
    return setTrackGearUp(track, gearUpAtIndex(track, idx));
  }

  function getOwnAircraftId() {
    return String(
      geofs?.aircraft?.instance?.id ??
      geofs?.aircraft?.instance?.aircraftRecord?.id ??
      ''
    ).trim();
  }

  function isOwnAircraftModelReady() {
    const model = geofs?.aircraft?.instance?.object3d?.model?._model;
    if (!model) return false;
    const readyFlag = model.ready !== false;
    return !!readyFlag;
  }

  function requestOwnAircraftSwitch(aircraftId) {
    const raw = String(aircraftId || '').trim();
    if (!raw) return false;
    const asNum = Number(raw);
    const arg = Number.isFinite(asNum) ? asNum : raw;
    const calls = [
      () => geofs?.switchAircraft?.(arg),
      () => geofs?.changeAircraft?.(arg),
      () => geofs?.aircraft?.change?.(arg),
      () => geofs?.aircraft?.instance?.change?.(arg),
      () => geofs?.api?.changeAircraft?.(arg)
    ];
    for (const fn of calls) {
      try {
        const res = fn();
        if (res !== undefined) return true;
      } catch { }
    }
    return false;
  }

  function applyOwnAircraftLiverySnapshot(snapshot) {
    const textures = Array.isArray(snapshot?.textures) ? snapshot.textures : [];
    if (!textures.length) return false;
    const model = geofs?.aircraft?.instance?.object3d?.model?._model;
    if (!model) return false;

    let applied = false;
    for (const item of textures) {
      const idx = Number(item?.index);
      const url = String(item?.url || '').trim();
      if (!url || !Number.isFinite(idx)) continue;
      try {
        geofs?.api?.changeModelTexture?.(model, url, { index: idx });
        applied = true;
      } catch {
        try {
          geofs?.api?.changeModelTexture?.(model, url, idx);
          applied = true;
        } catch { }
      }
    }
    return applied;
  }

  async function applyOwnAircraftResolvedLivery(track, liveryId) {
    const model = geofs?.aircraft?.instance?.object3d?.model?._model;
    if (!model) return false;

    const entry = getLiverySelectorAircraftEntry(track);
    if (!entry) return false;

    let livery = null;
    if (typeof liveryId === 'object' && liveryId) {
      const va = await getVALivery(track, liveryId);
      livery = va?.livery || null;
    } else {
      const idNum = Number(liveryId);
      if (!Number.isFinite(idNum)) return false;
      const idx = idNum >= LIVERY_ID_OFFSET ? idNum - LIVERY_ID_OFFSET : idNum;
      livery = entry?.liveries?.[idx] || null;
    }
    if (!livery) return false;

    const indices = Array.isArray(entry.index) ? entry.index : [];
    const textures = Array.isArray(livery.texture) ? livery.texture : [];
    const mats = livery.materials || {};
    let applied = false;

    for (let i = 0; i < textures.length; i++) {
      const tx = textures[i];
      if (tx && typeof tx === 'object' && tx.material != null) {
        const mat = mats?.[tx.material];
        if (mat) {
          applyGhostMaterial(model, mat);
          applied = true;
        }
        continue;
      }
      if (typeof tx !== 'string' || !tx) continue;
      const modelIndex = Number(indices[i]);
      if (!Number.isFinite(modelIndex)) continue;
      try {
        geofs?.api?.changeModelTexture?.(model, tx, { index: modelIndex });
        applied = true;
      } catch {
        try {
          geofs?.api?.changeModelTexture?.(model, tx, modelIndex);
          applied = true;
        } catch { }
      }
    }

    return applied;
  }

  async function applyOwnAircraftLiveryFromTrack(track, idx) {
    const snap = liverySnapshotAtIndex(track, idx);
    if (applyOwnAircraftLiverySnapshot(snap)) return true;

    const liv = cloneLiveryId(liveryAtIndex(track, idx));
    if (liv == null) return false;

    if (await applyOwnAircraftResolvedLivery(track, liv)) return true;

    try {
      geofs.aircraft.instance.liveryId = liv;
      return true;
    } catch {
      return false;
    }
  }

  function syncOwnAircraftTypeAndLiveryForTrack(track, idx) {
    if (!track) return;
    if (!isPilotMode(track) || activePilotTrackId !== track.id) return;

    const targetAircraftId = String(track.aircraftId || '').trim();
    if (targetAircraftId && getOwnAircraftId() !== targetAircraftId) {
      requestOwnAircraftSwitch(targetAircraftId);
      track._pilotOwnLiveryKey = '';
      return;
    }

    if (!isOwnAircraftModelReady()) return;

    const i = clamp(Math.floor(Number(idx) || 0), 0, Math.max(0, (track?.lla?.length || 1) - 1));
    const liv = liveryAtIndex(track, i);
    const snap = liverySnapshotAtIndex(track, i);
    const desired = `${getOwnAircraftId()}|${liverySig(liv) || liverySnapshotSig(snap) || 'none'}`;
    if (track._pilotOwnLiveryKey === desired) return;

    Promise.resolve(applyOwnAircraftLiveryFromTrack(track, i))
      .then((ok) => {
        if (ok) track._pilotOwnLiveryKey = desired;
      })
      .catch(() => { });
  }

  function restoreGhostVisualState(track, idx) {
    if (!track?._play?.playing) return;
    const last = Math.max(0, (track.lla?.length || 1) - 1);
    const i1 = clamp(Number.isFinite(Number(idx)) ? Number(idx) : Math.floor(track?._play?.idx || 0), 0, last);
    const i2 = clamp(i1 + 1, 0, last);
    if (!track._ghost) spawnGhost(track);
    const pose = poseAt(track, i1, i2, 0, 16);
    if (pose?.lla && pose?.htr) setGhostPose(track, pose.lla, pose.htr);
    const upNow = getTrackGearUp(track, i1);
    applyGhostGearStateWhenReady(track, upNow);
  }

  function switchTrackToGhostMode(track, options = {}) {
    if (!track) return;
    const syncOwnAircraft = options.syncOwnAircraft !== false;
    const last = Math.max(0, (track.lla?.length || 1) - 1);
    const idx = clamp(Math.floor(track?._play?.idx || 0), 0, last);
    const upNow = getTrackGearUp(track, idx);
    if (syncOwnAircraft) applyOwnAircraftGearState(upNow);
    setTrackMode(track, 'ghost');
    track._pilotNextSyncAt = 0;
    track._pilotOwnLiveryKey = '';
    if (activePilotTrackId === track.id) activePilotTrackId = null;
    restoreGhostVisualState(track, idx);
    applyCurrentLiveryForTrack(track);
  }

  function switchTrackToPilotMode(track) {
    if (!track) return;
    for (const tr of tracks) {
      if (tr && tr !== track && isPilotMode(tr)) {
        switchTrackToGhostMode(tr, { syncOwnAircraft: false });
      }
    }
    setTrackMode(track, 'pilot');
    activePilotTrackId = track.id;
    destroyGhostCallsignLabel(track);
    if (track._ghost) {
      try { track._ghost.destroy(); } catch { }
    }
    track._ghost = null;
    track._nodeCache = { ready: false, all: [], gear: [], wheels: [], doors: [], hideNodes: [] };

    const last = Math.max(0, (track.lla?.length || 1) - 1);
    const idx = clamp(Math.floor(track?._play?.idx || 0), 0, last);
    ensureTrackState(track).gearUp = null;
    track._pilotNextSyncAt = 0;
    track._pilotOwnLiveryKey = '';
    track._lastGearUp = null;
    syncOwnAircraftTypeAndLiveryForTrack(track, idx);
    const upNow = getTrackGearUp(track, idx);
    applyOwnAircraftGearState(upNow);
  }

  function syncOwnAircraftToPose(lla, htr) {
    const ac = geofs?.aircraft?.instance;
    if (!ac) return false;

    const lat = lla[0];
    const lon = lla[1];
    const alt = lla[2];
    const hdg = htr[0];
    const pit = htr[1];
    const rol = htr[2];

    try {
      if (Array.isArray(ac.llaLocation) && ac.llaLocation.length >= 3) {
        ac.llaLocation[0] = lat;
        ac.llaLocation[1] = lon;
        ac.llaLocation[2] = alt;
      } else {
        ac.llaLocation = [lat, lon, alt];
      }
    } catch { }

    const DEG = Math.PI / 180;
    try {
      const rot = ac.__frRotBuf || (ac.__frRotBuf = [0, 0, 0]);
      rot[0] = pit * DEG;
      rot[1] = rol * DEG;
      rot[2] = hdg * DEG;
      ac.object3d?.setInitialRotation?.(rot);
    } catch { }

    const rb = ac?.rigidBody;
    const zeroVec = (key) => {
      try {
        const v = rb?.[key];
        if (Array.isArray(v) && v.length >= 3) {
          v[0] = 0; v[1] = 0; v[2] = 0;
        } else if (rb) {
          rb[key] = [0, 0, 0];
        }
      } catch { }
    };
    zeroVec('v_acceleration');
    zeroVec('v_angularAcceleration');
    zeroVec('v_linearVelocity');
    zeroVec('v_angularVelocity');
    return true;
  }

  function setTrackPilotFollow(track, enabled) {
    if (!track) return;
    if (enabled) switchTrackToPilotMode(track);
    else switchTrackToGhostMode(track, { syncOwnAircraft: true });
  }

  function poseAt(track, i1, i2, f, dt) {
    const idxFloat = i1 + clamp(f, 0, 1);
    if (playbackSliderDragging) {
      const aL = track.lla[i1];
      const bL = track.lla[i2];
      const aH = track.htr[i1];
      const bH = track.htr[i2];
      const ff = clamp(f, 0, 1);
      const outL = track._pool.tmpB;
      interpLLA(aL, bL, ff, outL);
      return {
        lla: [outL[0], outL[1], outL[2]],
        htr: [
          lerpAngleDeg(aH[0], bH[0], ff),
          lerpAngleDeg(aH[1], bH[1], ff),
          lerpAngleDeg(aH[2], bH[2], ff)
        ]
      };
    }
    return applyPrecisionVisualFilter(track, idxFloat);
  }

  function startPlaybackInternal(track, t0) {
    if (!track || !track.lla?.length) return;

    if (!isPilotMode(track) && !track._ghost) spawnGhost(track);

    track._play.playing = true;
    track._play.paused = false;
    track._play.idx = 0;
    track._play.lastMsgIdx = -1;
    track._play.startT = t0;
    track._play.lastT = t0;
    track._precision = null;

    renderMessageTimeline(track);
    ensureTrackState(track).gearUp = null;
    track._lastGearUp = null;
    if (track._livery) {
      if (track._livery.startApplyTimer) {
        clearTimeout(track._livery.startApplyTimer);
        track._livery.startApplyTimer = null;
      }
      track._livery.lastSig = null;
      track._livery.appliedSig = null;
      track._livery.resetSig = null;
      track._livery.pendingId = null;
      track._livery.pendingSnapshot = null;
      track._livery.pendingSig = null;
      track._livery.applying = false;
      const initialLivery = liveryAtIndex(track, 0);
      const initialSnapshot = liverySnapshotAtIndex(track, 0);
      const initialSig = liverySig(initialLivery);
      track._livery.lastSig = initialSig;
      track._livery.pendingId = initialLivery;
      track._livery.pendingSnapshot = initialSnapshot;
      track._livery.pendingSig = initialSig;
      if (initialLivery != null || initialSnapshot) {
        // Exact same flow as UI helper buttons:
        // 1) "Reset ghost + Apply now"
        // 2) after delay, "Apply now"
        resetThenApplyLiveryForTrack(track);
        track._livery.startApplyTimer = setTimeout(() => {
          if (!track?._play?.playing) return;
          applyCurrentLiveryForTrack(track);
        }, 2000);
      }
    }
    updatePlayState();
  }

  function startPlaybackAt(track, t0) {
    startPlaybackInternal(track, t0);
  }

  function pausePlayback(track, paused) {
    if (!track?._play?.playing) return;
    const t = now();
    if (paused) {
      if (!track._play.paused) track._play.lastT = t;
      track._play.paused = true;
    } else {
      if (track._play.paused && Number.isFinite(track._play.lastT)) {
        track._play.startT += Math.max(0, t - track._play.lastT);
      }
      track._play.paused = false;
      track._play.lastT = t;
    }
    updateUi();
  }

  function stopPlayback(track) {
    if (!track?._play) return;
    const currentIdx = clamp(
      Math.floor(track?._play?.idx || 0),
      0,
      Math.max(0, (track.lla?.length || 1) - 1)
    );

    track._play.playing = false;
    track._play.paused = true;
    track._play.idx = 0;
    track._play.lastMsgIdx = -1;

    if (track._ghost) {
      try { track._ghost.destroy(); } catch { }
    }

    if (isPilotMode(track)) {
      const upNow = getTrackGearUp(track, currentIdx);
      applyOwnAircraftGearState(upNow);
    }

    destroyGhostCallsignLabel(track);
    track._ghost = null;
    setTrackMode(track, 'ghost');
    if (activePilotTrackId === track.id) activePilotTrackId = null;
    track._nodeCache = { ready: false, all: [], gear: [], wheels: [], doors: [], hideNodes: [] };
    ensureTrackState(track).gearUp = null;
    track._lastGearUp = null;
    if (track._livery) {
      if (track._livery.startApplyTimer) {
        clearTimeout(track._livery.startApplyTimer);
        track._livery.startApplyTimer = null;
      }
      track._livery.lastSig = null;
      track._livery.appliedSig = null;
      track._livery.resetSig = null;
      track._livery.pendingId = null;
      track._livery.pendingSnapshot = null;
      track._livery.pendingSig = null;
      track._livery.applying = false;
    }
    track._pilotNextSyncAt = 0;
    track._pilotOwnLiveryKey = '';
    updatePlayState();
  }

  function playbackFixedStep(track, dt) {
    if (!track?._play?.playing || track._play.paused) return;
    const pilotFollow = isPilotMode(track);
    if (!pilotFollow) {
      if (!track._ghost) return;
      if (!track._ghost._model?.ready) return;
    }

    const p = track._play;
    const elapsedMs = Math.max(0, now() - p.startT);
    const idxFloat = elapsedMs / Math.max(1, track.sampleMs);
    p.idx = Math.floor(idxFloat);

    const last = track.lla.length - 1;
    const i1 = clamp(p.idx, 0, last);
    const i2 = clamp(i1 + 1, 0, last);
    let f = idxFloat - Math.floor(idxFloat);
    if (easingOn) f = smoothstep(f);

    const pose = poseAt(track, i1, i2, f, dt);
    if (!pose || !Array.isArray(pose.lla) || !Array.isArray(pose.htr)) {
      return;
    }

    if (pilotFollow) {
      syncOwnAircraftToPose(pose.lla, pose.htr);

      const { upNow, changed } = syncTrackGearUp(track, i1);
      if (changed) applyOwnAircraftGearState(upNow);

      const tNow = now();
      const nextSyncAt = Number(track._pilotNextSyncAt || 0);
      if (!Number.isFinite(nextSyncAt) || tNow >= nextSyncAt) {
        track._pilotNextSyncAt = tNow + 1000;
        syncOwnAircraftTypeAndLiveryForTrack(track, i1);
      }
    } else {
      setGhostPose(track, pose.lla, pose.htr);
    }

    if (!pilotFollow && track._livery && !track._livery.applying && track._livery.pendingId != null) {
      const ps = track._livery.pendingSig || liverySig(track._livery.pendingId);
      if (!ps || track._livery.appliedSig !== ps) {
        requestApplyTrackLivery(track, track._livery.pendingId, track._livery.pendingSnapshot);
      } else {
        track._livery.pendingId = null;
        track._livery.pendingSnapshot = null;
        track._livery.pendingSig = null;
      }
    }

    if (!pilotFollow) {
      const { upNow, changed } = syncTrackGearUp(track, i1);
      if (changed) {
        applyGearState(track, upNow);
        hideConfiguredNodes(track);
      }
    }

    if (track.messageEvents && track.messageEvents.length > 0) {
      const prevIdx = track._play.lastMsgIdx ?? -1;
      const currIdx = Math.floor(p.idx);

      // Execute when playback index progresses or scrubs
      if (currIdx !== prevIdx) {
        const isForward = currIdx > prevIdx;
        const callsign = track.callsign ? `${track.callsign}: ` : '';

        for (const msgEvent of track.messageEvents) {
          // Verify frame intersection threshold marks
          const hit = isForward 
            ? (msgEvent.t > prevIdx && msgEvent.t <= currIdx)
            : (msgEvent.t >= currIdx && msgEvent.t < prevIdx);

          if (hit) {
            // Provide exact instance linkages down to the HUD layer
            showFlightMessage(`${callsign}${msgEvent.text}`, track, msgEvent);
          }
        }
        // Save the index marker state directly
        track._play.lastMsgIdx = currIdx;
      }
    }

    if (i1 >= last) {
      p.paused = true;
    }
  }

  /* ---------- Storage ---------- */
  function saveRecorderPrefs() {
    try {
      localStorage.setItem(LS_CALLSIGN_KEY, sanitizeCallsign(recordCallsign || ''));
    } catch {
      // ignore storage failures
    }
  }

  function loadRecorderPrefs() {
    try {
      recordCallsign = sanitizeCallsign(localStorage.getItem(LS_CALLSIGN_KEY) || '');
    } catch {
      recordCallsign = '';
    }
  }

  function openRecorderDb() {
    if (idbOpenPromise) return idbOpenPromise;
    idbOpenPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is not available in this browser.'));
        return;
      }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB.'));
    }).catch((err) => {
      idbOpenPromise = null;
      throw err;
    });
    return idbOpenPromise;
  }

  function applyProjectToTracks(project) {
    if (!project?.tracks?.length) {
      tracks = [];
      ensureSelectionStateForTracks();
      refreshNextTrackNumber();
      updatePlayState();
      return;
    }
    tracks = project.tracks.map((t) => {
      const tr = normalizeTrackMeta({
        orderId: t.orderId,
        id: t.id,
        name: t.name,
        callsign: t.callsign,
        description: t.description,
        createdAt: t.createdAt,
        aircraftId: t.aircraftId,
        modelUrl: t.modelUrl,
        sampleMs: t.sampleMs,
        base: t.base,
        lla: t.lla,
        htr: t.htr,
        xy: t.xy,
        gearEvents: t.gearEvents,
        liveryEvents: t.liveryEvents
      }, 1);
      initTrackRuntime(tr);
      return tr;
    });
    tracks.sort((a, b) => (a.orderId || 0) - (b.orderId || 0));
    tracks.forEach((t, i) => normalizeTrackMeta(t, i + 1));
    ensureSelectionStateForTracks();
    refreshNextTrackNumber();
    updatePlayState();
  }

  async function saveToIndexedDB(notifyOnError = false) {
    try {
      const db = await openRecorderDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put({ key: IDB_PROJECT_KEY, data: buildProject(), updatedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Failed to write to IndexedDB.'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
      });
      return true;
    } catch (e) {
      if (notifyOnError) {
        const msg = String(e?.name || e?.message || e || '');
        alert(`Save failed: ${msg || 'unknown error'}`);
      }
      return false;
    }
  }

  async function loadFromIndexedDB() {
    try {
      const db = await openRecorderDb();
      const record = await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(IDB_PROJECT_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error || new Error('Failed to read IndexedDB data.'));
      });

      const project = record?.data;
      if (project && typeof project === 'object') {
        applyProjectToTracks(project);
        return true;
      }

      tracks = [];
      ensureSelectionStateForTracks();
      refreshNextTrackNumber();
      updatePlayState();
      return false;
    } catch {
      tracks = [];
      ensureSelectionStateForTracks();
      refreshNextTrackNumber();
      updatePlayState();
      return false;
    }
  }

  function exportJSON(fileName) {
    const baseDefault = `flight-recorder-${VERSION}`;
    const raw = String(fileName || '').trim();
    const safeBase = (raw || baseDefault)
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    const finalBase = safeBase || baseDefault;
    const finalName = /\.json$/i.test(finalBase) ? finalBase : `${finalBase}.json`;

    const blob = new Blob([JSON.stringify(buildProject())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = finalName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importJSON(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const project = JSON.parse(String(rd.result || '{}'));
        const srcTracks = Array.isArray(project?.tracks) ? project.tracks : Array.isArray(project) ? project : [];
        const added = [];
        for (const t of srcTracks) {
          const tr = normalizeTrackMeta({
            orderId: t.orderId,
            id: t.id,
            name: t.name || 'Imported',
            callsign: t.callsign,
            description: t.description,
            createdAt: t.createdAt,
            aircraftId: t.aircraftId,
            modelUrl: t.modelUrl,
            sampleMs: t.sampleMs,
            base: t.base,
            lla: t.lla,
            htr: t.htr,
            xy: t.xy,
            gearEvents: t.gearEvents,
            liveryEvents: t.liveryEvents,
            messageEvents: t.messageEvents || []
          }, nextTrackNumber++);
          initTrackRuntime(tr);
          added.push(tr);
        }
        tracks.push(...added);
        tracks.sort((a, b) => (a.orderId || 0) - (b.orderId || 0));
        ensureSelectionStateForTracks();
        refreshNextTrackNumber();
        void saveToIndexedDB();
        updateUi();
      } catch (e) {
        alert(`Import failed: ${e}`);
      }
    };
    rd.readAsText(file);
  }

  /* ---------- Actions ---------- */
  function getSelectedTracks() {
    ensureSelectionStateForTracks();
    return tracks.filter((t) => isTrackSelected(t.id) && t?.lla?.length);
  }

  function playSelectedTracks() {
    if (recordState !== 'IDLE') return;
    const selected = getSelectedTracks();
    if (!selected.length) return alert('Select at least one track.');

    const t0 = now();
    for (const tr of selected) {
      if (!tr._play.playing) startPlaybackAt(tr, t0);
      else if (tr._play.paused) pausePlayback(tr, false);
    }
    updateUi();
  }

  function pauseSelectedTracks() {
    const selected = getSelectedTracks();
    if (!selected.length) return alert('Select at least one track.');
    for (const tr of selected) {
      if (tr._play.playing && !tr._play.paused) pausePlayback(tr, true);
    }
    updateUi();
  }

  function stopSelectedTracks() {
    const selected = getSelectedTracks();
    if (!selected.length) return alert('Select at least one track.');
    for (const tr of selected) stopPlayback(tr);
    updateUi();
  }

  function startRecordingWithSelectedPlaybacks() {
    if (recordState !== 'IDLE') return;

    stopAll();

    const selected = getSelectedTracks();
    const t0 = now();
    for (const tr of selected) startPlaybackAt(tr, t0);
    startRecordingAt(t0);
    updateUi();
  }

  function stopAll() {
    for (const tr of tracks) stopPlayback(tr);
    updatePlayState();
    updateUi();
  }

  function getPlaybackUiMode() {
    if (playState === 'IDLE') return 'IDLE';
    const hasActive = tracks.some((t) => t._play?.playing && !t._play?.paused);
    return hasActive ? 'PLAYING' : 'PAUSED';
  }

  function getSliderTracks() {
    const selected = getSelectedTracks().filter((t) => t._play?.playing);
    if (selected.length) return selected;
    return tracks.filter((t) => t._play?.playing);
  }

  function getTrackDurationMs(track) {
    const last = Math.max(0, track.lla.length - 1);
    return last * track.sampleMs;
  }

  function getLongestTimelineTrack(targets) {
    if (!targets?.length) return null;
    let best = targets[0];
    let bestMs = getTrackDurationMs(best);
    for (let i = 1; i < targets.length; i++) {
      const t = targets[i];
      const ms = getTrackDurationMs(t);
      if (ms > bestMs) {
        best = t;
        bestMs = ms;
      }
    }
    return best;
  }

  function seekTrackToIndex(track, targetIdx, options = {}) {
    const applyHeavy = options.applyHeavy !== false;
    if (!track?._play?.playing) return;
    const last = Math.max(0, (track.lla?.length || 1) - 1);
    const idx = clamp(Math.round(targetIdx), 0, last);
    track._play.idx = idx;

    const i1 = idx;
    const i2 = clamp(i1 + 1, 0, last);
    const pose = poseAt(track, i1, i2, 0, 16);

    if (isPilotMode(track)) {
      if (pose?.lla && pose?.htr) syncOwnAircraftToPose(pose.lla, pose.htr);
      const upNow = getTrackGearUp(track, i1);
      applyOwnAircraftGearState(upNow);
    } else {
      if (!track._ghost) spawnGhost(track);
      if (track._ghost?._model?.ready) {
        if (pose?.lla && pose?.htr) setGhostPose(track, pose.lla, pose.htr);

        if (applyHeavy) {
          const upNow = getTrackGearUp(track, i1);
          applyGearState(track, upNow);
          hideConfiguredNodes(track);
        }
      }
    }

    if (!track._play.paused) {
      track._play.startT = now() - (idx * Math.max(1, track.sampleMs));
    } else {
      track._play.lastT = now();
    }
  }

  function seekPlaybackByRatio(ratio, options = {}) {
    const r = clamp(Number(ratio) || 0, 0, 1);
    const targets = getSliderTracks();
    if (!targets.length) return;
    const longest = getLongestTimelineTrack(targets);
    const longestDurationMs = Math.max(0, getTrackDurationMs(longest));
    const targetTimeMs = r * longestDurationMs;
    for (const tr of targets) {
      const idxFromTime = targetTimeMs / Math.max(1, tr.sampleMs || 16);
      seekTrackToIndex(tr, idxFromTime, options);
    }
    if (options.updateUi !== false) updateLiveStatus();
  }

  function updateGhostCallsignVisibility() {
    for (const tr of tracks) {
      if (!tr?._play?.playing) continue;
      if (!showCallsign) {
        destroyGhostCallsignLabel(tr);
        continue;
      }
      const idx = clamp(Math.floor(tr._play?.idx || 0), 0, Math.max(0, (tr.lla?.length || 1) - 1));
      const lla = tr.lla?.[idx] || tr.lla?.[0] || null;
      if (lla) ensureGhostCallsignLabel(tr, lla);
    }
  }

  function renameTrack(id, name) {
    const tr = tracks.find((t) => t.id === id);
    if (!tr) return;
    tr.name = name?.trim() || tr.name;
    void saveToIndexedDB();
  }

  function setTrackDescription(id, description) {
    const tr = tracks.find((t) => t.id === id);
    if (!tr) return;
    tr.description = String(description || '');
    void saveToIndexedDB();
  }

  function setTrackCallsign(id, callsign) {
    const tr = tracks.find((t) => t.id === id);
    if (!tr) return;
    tr.callsign = sanitizeCallsign(callsign || '');
    if (tr._play?.playing) {
      const idx = clamp(Math.floor(tr._play?.idx || 0), 0, Math.max(0, (tr.lla?.length || 1) - 1));
      const lla = tr.lla?.[idx] || tr.lla?.[0] || null;
      if (lla) ensureGhostCallsignLabel(tr, lla);
    }
    void saveToIndexedDB();
  }

  function deleteTrack(id) {
    const idx = tracks.findIndex((t) => t.id === id);
    if (idx < 0) return;
    stopPlayback(tracks[idx]);
    tracks.splice(idx, 1);
    trackSelectionState.delete(id);
    void saveToIndexedDB();
    updateUi();
  }

  /* ---------- UI ---------- */

  let flightMsgTimeout = null;

  function showFlightMessage(text, track, msgEvent) {
    if (!text) return;
    
    let msgBox = document.getElementById('fr-flight-message-hud');
    if (!msgBox) {
      msgBox = document.createElement('div');
      msgBox.id = 'fr-flight-message-hud';
      msgBox.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 18px;
        font-weight: bold;
        z-index: 100000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        border: 2px solid #4CAF50;
        text-align: center;
        max-width: 80%;
        display: none;
      `;
      document.body.appendChild(msgBox);
    }

    // Ensure pointer events are active so the close button registers clicks
    msgBox.style.pointerEvents = 'auto';

    // Render the message string and structural clear button
    msgBox.innerHTML = text + ' <span class="flight-msg-close" style="cursor: pointer; margin-left: 12px; color: #ff4444; font-size: 20px;" title="Delete">&times;</span>';
    msgBox.style.display = 'block';

    speakMessage(text);

    const closeBtn = msgBox.querySelector('.flight-msg-close');
    if (closeBtn && track && msgEvent) {
      closeBtn.onclick = (ev) => {
        ev.stopPropagation();
        
        // 1. Remove the specific message item from the tracking array
        track.messageEvents = track.messageEvents.filter(m => m !== msgEvent);
        
        // 2. Clear out the HUD interface directly
        msgBox.style.display = 'none';
        
        // 3. Force-refresh timeline layer to instantly wipe out the diamond element
        renderMessageTimeline(track);

        // 4. Mirror mutation to Persistent Storage
        saveToIndexedDB();
      };
    }

    // Erase existing cleanup timers if sequence is closely stacked
    if (flightMsgTimeout) clearTimeout(flightMsgTimeout);

    // Auto-expire display state after exactly 3 seconds
    flightMsgTimeout = setTimeout(() => {
      msgBox.style.display = 'none';
      flightMsgTimeout = null;
    }, 3000);
  }

  function renderMessageTimeline(track) {
    const container = document.getElementById('message-timeline-container');
    const playbackInput = document.getElementById('playbackPos');
    
    if (!container) return;
    if (!track) return;

    // Zorg voor de juiste CSS-context
    container.style.position = 'relative';
    container.style.overflow = 'visible'; 

    const totalSamples = track.lla ? track.lla.length : 1;
    const messages = track.messageEvents || [];
    const callsign = track.callsign || "unknown";

    // BESCHERMING: Als er 0 berichten binnenkomen, maar de balk heeft al diamantjes 
    // van deze vlucht, negeer dan de lege update zodat ze niet verdwijnen!
    if (messages.length === 0) {
        const hasExistingDiamonds = container.querySelector('.timeline-diamond') !== null;
        const isSameFlight = container.dataset.lastCallsign === callsign;

        if (hasExistingDiamonds && isSameFlight) {
            // De loop probeert de diamantjes te wissen, maar we weigeren dit.
            return; 
        }
        
        // Alleen als we écht naar een andere vlucht switchen, maken we de balk leeg
        container.innerHTML = '';
        container.dataset.lastCallsign = callsign;
        return;
    }

    // Sla de huidige callsign op in de HTML als referentie
    container.dataset.lastCallsign = callsign;

    // Nu pas maken we de balk leeg, omdat we legitieme nieuwe diamantjes gaan tekenen
    container.innerHTML = ''; 

    console.log(`[Timeline] Succesvol gecached! Diamantjes worden definitief getekend voor ${callsign}.`);

    messages.forEach((msg, index) => {
        let percentage = (msg.t / totalSamples) * 100;
        if (percentage < 0) percentage = 0;
        if (percentage > 100) percentage = 100;

        const diamond = document.createElement('span');
        diamond.className = 'timeline-diamond';
        
        diamond.style.cssText = `
            position: absolute !important;
            left: ${percentage}% !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
            color: #ffcc00 !important; 
            cursor: pointer !important;
            font-size: 18px !important; 
            z-index: 99999 !important; 
            line-height: 1 !important;
            display: inline-block !important;
            text-shadow: 0px 0px 3px rgba(0,0,0,0.9);
        `;
        
        diamond.innerHTML = '◆'; 
        diamond.title = `Klik om te springen naar: "${msg.text}"`; 

        diamond.onclick = (ev) => {
            ev.stopPropagation(); 
            if (playbackInput) {
                playbackInput.value = msg.t;
                playbackInput.dispatchEvent(new Event('input'));
                playbackInput.dispatchEvent(new Event('change'));
            }
            if (typeof seekTrackToIndex === 'function') {
                seekTrackToIndex(track, msg.t);
            }
        };

        container.appendChild(diamond);
    });
}

  // Speaks one chat message using the browser speech synthesis API.
  function speakMessage(message) {
    const synth = window.speechSynthesis;
    if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') return false;

    message = message.substring(message.indexOf(":") + 1).trim(); // Remove callsign prefix if present

    const utterance = new window.SpeechSynthesisUtterance(message);
    utterance.lang = 'en-US';
    utterance.rate = 1.3;
    synth.speak(utterance);
  }

  function ensureEmbeddedPanel() {
    const host = document.querySelector('.geofs-ui-left');
    if (!host) {
      console.warn('Flight Recorder: Embedded panel not found, returning...');
      return null;
    }

    let panel = document.getElementById(FR_PANEL_ID);
    if (!panel) {
      console.warn('Flight Recorder: Embedded panel found.');
      panel = document.createElement('div');
      panel.id = FR_PANEL_ID;
      panel.className = 'geofs-list geofs-toggle-panel flight-recorder-list geofs-stopMousePropagation geofs-stopKeyupPropagation';
      panel.setAttribute('data-noblur', 'true');
      panel.setAttribute('data-onshow', '{geofs.initializePreferencesPanel()}');
      panel.setAttribute('data-onhide', '{geofs.savePreferencesPanel()}');
      panel.setAttribute('style', 'max-width: 530px;');
      host.appendChild(panel);
    }

    return panel;
  }

  function mountGuiIntoPanel() {
    const panel = ensureEmbeddedPanel();
    if (!panel) return null;

    if (gui.panelEl === panel && gui.recBtn) return panel;

    panel.innerHTML = `
      <div style="font-family: Segoe UI, sans-serif; padding:14px;">
        <img src="https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Images/scripts/geo-fs-flight-recorder-horizontal.png" alt="Flight Recorder" style="display:block; max-width:100%; height:auto; margin:0 auto 12px;">
        <p style="margin: 10px 0 12px; text-align: center;">Version ${VERSION}</p>

        <fieldset style="background: #ccc; padding: 20px; border-radius: 20px; margin-bottom: 20px;">
          <div style="display:flex; justify-content:center; align-items:center;">
            <button id="recBtn" style="font-size:18px; font-weight:700; min-width:260px; padding:12px 14px; border:none; border-radius:80px; cursor:pointer; color:#fff;"></button>
          </div>
          <div id="recHint" style="text-align:center; color:#777; margin-top:4px; border-bottom: 1px solid #333; padding-bottom: 10px;"></div>
          <div style="text-align:center; color:#555; margin-top:8px;">
            <label for="rateSel">Rate</label>
            <select id="rateSel" style="margin-left:6px;">
              <option value="100">10 Hz</option>
              <option value="50">20 Hz</option>
              <option value="33">30 Hz</option>
              <option value="16" selected>60 Hz</option>
            </select>
          </div>
          <div style="text-align:center; color:#555; margin-top:8px;">
            <label for="callsignIn">Callsign</label>
            <input id="callsignIn" type="text" maxlength="24" placeholder="bijv. BA01" style="margin-left:6px; width:180px;">
          </div>
          <div id="recStatus" style="text-align:center; color:#777; margin-top:10px; font-size:14px;">REC • 0 • ${(1000 / defaultSampleMs).toFixed(1)} Hz</div>
        </fieldset>

        <fieldset style="margin-bottom:10px;">
          <div style="margin-bottom:6px; display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
            <button id="exportBtn">Export Flights</button>
            <button id="importBtn">Import Flights</button>
            <input type="file" id="importFile" accept="application/json" style="display:none;">
          </div>
        </fieldset>

        <fieldset style="margin-bottom:10px;">
          <div style="display:flex; justify-content:center; gap:14px; flex-wrap:wrap; align-items:center;">
            <button id="playSelBtn" title="Play selected" style="width:62px; height:62px; border-radius:50%; border:1px solid #2c4f02; background:#4B8603; color:#fff; font-size:26px; font-weight:700; cursor:pointer;">▶</button>
            <button id="pauseSelBtn" title="Pause selected" style="width:62px; height:62px; border-radius:50%; border:1px solid #002441; background:#014275; color:#fff; font-size:24px; font-weight:700; cursor:pointer;">❚❚</button>
            <button id="stopSelBtn" title="Stop selected" style="width:62px; height:62px; border-radius:50%; border:1px solid #991b1b; background:#dc2626; color:#fff; font-size:22px; font-weight:700; cursor:pointer;">■</button>
            <button id="addMsgBtn" style="display:none; font-size:14px; padding:6px 12px; border:none; border-radius:4px; cursor:pointer; background:#2196F3; color:#fff; margin-left:6px;" title="Add annotation">💬</button>
          </div>
          <div style="text-align:center; margin-top:10px; padding-bottom:20px;">
            <div id="message-timeline-container"></div>
            <input id="playbackPos" type="range" min="0" max="1000" step="1" value="0" style="width:min(760px, 95%);">
            <div id="playbackPosInfo" style="color:#666; font-size:12px; margin-top:3px;">Playback position: 0%</div>
          </div>
          <div style="text-align:center; color:#555; margin-bottom:10px;">
            <label for="ultraStrength">Smoothing</label>
            <input id="ultraStrength" type="range" min="0" max="100" step="1" value="${ultraStrength}" style="width:220px; vertical-align:middle;">
            <span id="ultraStrengthVal">${ultraStrength}</span>
          </div>
          <div style="text-align:center; color:#555; margin-bottom:10px;">
            <label style="cursor:pointer;"><input id="showCallsignCb" type="checkbox" ${showCallsign ? 'checked' : ''}> Show Callsign</label>
          </div>
          <div id="tracks"></div>
        </fieldset>

        <div style="margin-top:10px;"><small id="info" style="color:#444;"></small></div>
      </div>
    `;

    gui.panelEl = panel;
    guiWin = {
      closed: false,
      document,
      focus: () => {
        panel.classList.add('geofs-visible');
      }
    };

    return panel;
  }

  function setPanelVisible(show) {
    const panel = mountGuiIntoPanel();
    if (!panel) return;
    panel.classList.toggle('geofs-visible', !!show);
    const leftHost = document.querySelector('.geofs-ui-left');
    if (leftHost) leftHost.classList.toggle('geofs-visible', !!show);
    try {
      if (show) geofs?.initializePreferencesPanel?.();
      else geofs?.savePreferencesPanel?.();
    } catch { }
    if (show) updateUi();
  }

  function togglePanel() {
    if (isPanelVisible()) {
      setPanelVisible(false);
      return;
    }
    openGui();
    setPanelVisible(true);
  }

  function ensureBottomButton() {
    const bar = document.querySelector('.geofs-ui-bottom');
    if (!bar) return null;

    let button = document.getElementById(FR_BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = FR_BUTTON_ID;
      button.className = 'mdl-button mdl-js-button geofs-f-standard-ui geofs-mediumScreenOnly';
      button.textContent = 'REC';

      const insertPos = geofs?.version >= 3.6 ? 4 : 3;
      if (bar.children.length > insertPos) bar.insertBefore(button, bar.children[insertPos]);
      else bar.appendChild(button);
    }

    button.title = 'Flight Recorder';
    button.setAttribute('data-toggle-panel', '.flight-recorder-list');
    button.setAttribute('data-tooltip-classname', 'mdl-tooltip--top');
    button.setAttribute('data-upgraded', ',MaterialButton');
    button.setAttribute('onclick', 'FlightRecorder.togglePanel()');
    if (!button.dataset.frClickBound) {
      button.addEventListener('click', () => {
        togglePanel();
      });
      button.dataset.frClickBound = '1';
    }

    return button;
  }

  function initEmbeddedUi() {
    window.FlightRecorder = window.FlightRecorder || {};
    window.FlightRecorder.togglePanel = togglePanel;
    exposeDebugApi();
    bindPanelToggleHotkey();

    const tryInit = () => {
      const panelHost = document.querySelector('.geofs-ui-left');
      const buttonHost = document.querySelector('.geofs-ui-bottom');
      if (!panelHost || !buttonHost) return false;
      ensureBottomButton();
      mountGuiIntoPanel();
      return true;
    };

    if (tryInit()) return;
    const timer = setInterval(() => {
      if (tryInit()) clearInterval(timer);
    }, 500);
  }

  function openGui() {
    const panel = mountGuiIntoPanel();
    if (!panel) return;
    try { geofs?.initializePreferencesPanel?.(); } catch { }

    gui.recBtn = guiWin.document.getElementById('recBtn');
    gui.rateSel = guiWin.document.getElementById('rateSel');
    gui.callsignIn = guiWin.document.getElementById('callsignIn');
    gui.recStatus = guiWin.document.getElementById('recStatus');
    gui.recHint = guiWin.document.getElementById('recHint');
    gui.ultraStrength = guiWin.document.getElementById('ultraStrength');
    gui.ultraStrengthVal = guiWin.document.getElementById('ultraStrengthVal');
    gui.showCallsignCb = guiWin.document.getElementById('showCallsignCb');
    gui.playSelBtn = guiWin.document.getElementById('playSelBtn');
    gui.pauseSelBtn = guiWin.document.getElementById('pauseSelBtn');
    gui.stopSelBtn = guiWin.document.getElementById('stopSelBtn');
    gui.addMsgBtn = guiWin.document.getElementById('addMsgBtn');
    gui.playbackPos = guiWin.document.getElementById('playbackPos');
    gui.playbackPosInfo = guiWin.document.getElementById('playbackPosInfo');
    gui.tracksDiv = guiWin.document.getElementById('tracks');
    gui.exportBtn = guiWin.document.getElementById('exportBtn');
    gui.importBtn = guiWin.document.getElementById('importBtn');
    gui.importFile = guiWin.document.getElementById('importFile');
    gui.info = guiWin.document.getElementById('info');
    bindKeyboardShield();

    gui.recBtn.onclick = () => {
      if (recordState === 'RECORDING') stopRecording();
      else startRecordingWithSelectedPlaybacks();
      updateUi();
    };

    gui.addMsgBtn.addEventListener('click', () => {
    if (!activePilotTrackId) return;
    
    const tr = tracks.find(t => t.id === activePilotTrackId);
    if (!tr) return;

    // Toon prompt (alert met invoer) aan de gebruiker
    const text = prompt("Add a note or message at this time:");
    if (!text || !text.trim()) return;

    // Bepaal het huidige tijdframe (index)
    const currentIdx = Math.floor(tr._play?.idx || 0);

    // Voeg toe aan de data
    if (!Array.isArray(tr.messageEvents)) tr.messageEvents = [];
    tr.messageEvents.push({
      t: currentIdx,
      text: text.trim()
    });

    // Sorteer events chronologisch en sla op in IndexedDB
    tr.messageEvents.sort((a, b) => a.t - b.t);
    void saveToIndexedDB();
    
    // Toon direct ter bevestiging 3 sec in beeldscherm
    showFlightMessage(`[Saved]: ${text.trim()}`);
  });

    gui.rateSel.value = String(defaultSampleMs);
    if (gui.callsignIn) gui.callsignIn.value = recordCallsign;
    gui.rateSel.onchange = (e) => {
      defaultSampleMs = Number(e.target.value) || 16;
      updateLiveStatus();
    };
    if (gui.callsignIn) {
      gui.callsignIn.oninput = (e) => {
        const clean = sanitizeCallsign(e.target.value || '');
        recordCallsign = clean;
        if (e.target.value !== clean) e.target.value = clean;
        saveRecorderPrefs();
      };
    }
    gui.ultraStrength.value = String(ultraStrength);
    gui.ultraStrengthVal.textContent = String(ultraStrength);
    gui.ultraStrength.oninput = (e) => {
      ultraStrength = clamp(Number(e.target.value) || 0, 0, 100);
      for (const tr of tracks) {
        tr._precision = null;
      }
      gui.ultraStrengthVal.textContent = String(ultraStrength);
    };
    if (gui.showCallsignCb) {
      gui.showCallsignCb.checked = !!showCallsign;
      gui.showCallsignCb.onchange = (e) => {
        showCallsign = !!e.target.checked;
        updateGhostCallsignVisibility();
      };
    }

    if (gui.playbackPos) {
      const seekFromSlider = () => {
        const ratio = clamp((Number(gui.playbackPos.value) || 0) / 1000, 0, 1);
        seekPlaybackByRatio(ratio);
      };
      gui.playbackPos.oninput = () => {
        playbackSliderDragging = true;
        const t = now();
        if (t - lastSliderSeekTs < 33) return;
        lastSliderSeekTs = t;
        const ratio = clamp((Number(gui.playbackPos.value) || 0) / 1000, 0, 1);
        seekPlaybackByRatio(ratio, { applyHeavy: false, updateUi: false });
        updatePlaybackSliderUi();
      };
      gui.playbackPos.onchange = () => {
        lastSliderSeekTs = 0;
        seekFromSlider();
        playbackSliderDragging = false;
      };
      gui.playbackPos.onmousedown = () => { playbackSliderDragging = true; };
      gui.playbackPos.onmouseup = () => { playbackSliderDragging = false; };
    }

    gui.playSelBtn.onclick = () => playSelectedTracks();
    gui.pauseSelBtn.onclick = () => pauseSelectedTracks();
    gui.stopSelBtn.onclick = () => stopSelectedTracks();
    gui.exportBtn.onclick = () => {
      const suggested = `GeoFS Flight - ${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
      const name = prompt('Filename for export:', suggested);
      if (name == null) return;
      exportJSON(name);
    };
    gui.importBtn.onclick = () => gui.importFile.click();
    gui.importFile.onchange = (e) => {
      const f = e.target.files?.[0];
      if (f) importJSON(f);
      e.target.value = '';
    };

    updateUi();
  }

  function renderFlightsList() {
    if (!gui.tracksDiv) return;
    ensureSelectionStateForTracks();

    if (!tracks.length) {
      gui.tracksDiv.innerHTML = '<p><i>No flights recorded/loaded yet.</i></p>';
      updateRecordingHint();
      return;
    }

    const orderedTracks = [...tracks].sort((a, b) => (a.orderId || 0) - (b.orderId || 0));
    gui.tracksDiv.innerHTML = orderedTracks.map((t) => {
      const seconds = Math.round((t.lla.length * t.sampleMs) / 1000);
      const rateHz = (1000 / t.sampleMs).toFixed(1);
      const callsign = sanitizeCallsign(t.callsign || '');
      const checked = isTrackSelected(t.id) ? 'checked' : '';
      const recDate = formatTrackDate(t.createdAt);
      const orderLabel = String(t.orderId || 0).padStart(4, '0');
      const pilotFollowOn = !!t._pilotFollow;
      const pilotBtnLabel = pilotFollowOn ? 'Stop Fly' : 'Fly This Track';
      const pilotBtnStyle = pilotFollowOn ? 'background:#004274; border:1px solid #002441; color:#fff; padding: 5px 20px; border-radius: 3px;' : 'background:#4B8603; border:1px solid #2c4f02; color:#fff; padding: 5px 20px; border-radius: 3px;';
      const showPilotBtn = !!t._play?.playing;

      return `
        <style>
          /* Container vlak boven de slider */
          #message-timeline-container {
            position: relative;
            width: 100%;
            height: 14px;
            margin-bottom: -2px; /* Zorgt dat het strak op de slider aansluit */
            background: rgba(0, 0, 0, 0.15);
            border-radius: 4px;
            width: min(760px, 95%);
            margin: 2px auto;
          }

          /* Stijl voor de gele diamantjes op de tijdlijn */
          .timeline-diamond {
            position: absolute;
            top: 50%;
            transform: translate(-50%, -50%); /* Centreert het diamantje exact op de tijd-positie */
            color: #ffeb3b; /* Felgeel */
            font-size: 14px;
            cursor: pointer;
            user-select: none;
            transition: transform 0.1s, color 0.1s;
          }

          .timeline-diamond:hover {
            color: #ffffff;
            transform: translate(-50%, -50%) scale(1.3);
          }

          /* Stijl voor het rode kruisje in de Message Box */
          .flight-msg-close {
            color: #ff4d4d;
            font-weight: bold;
            float: right;
            margin-left: 15px;
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
          }

          .flight-msg-close:hover {
            color: #ff0000;
          }
        </style>
        <div style="border:1px solid #ccc; background:rgba(255, 255, 255, 0.6); padding:8px; margin-bottom:8px; border-radius:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin: 0 13px 8px 9px">
            <label style="font-size:15px; font-weight:600; display:flex; align-items:center; gap:8px; margin:0;">
              <input type="checkbox" class="track-select" data-id="${escapeHtml(t.id)}" ${checked} style="width:20px; height:20px; cursor:pointer;"> Use in Playback
            </label>
            ${showPilotBtn ? `<button class="pilotBtn" data-id="${escapeHtml(t.id)}" title="Hide ghost and let your own aircraft follow this playback" style="${pilotBtnStyle}">${pilotBtnLabel}</button>` : ''}
          </div>
          <div style="display:flex; justify-content:center;">
            <input class="nameIn" data-id="${escapeHtml(t.id)}" value="${escapeHtml(t.name || 'Unnamed')}" style="width:min(720px, 95%); text-align:center; font-size:18px; font-weight:700; padding:6px 8px; box-sizing:border-box;">
          </div>
          <div style="display:flex; justify-content:center;margin-top:-1px">
            <input class="trackCallsignIn" data-id="${escapeHtml(t.id)}" maxlength="24" placeholder="Callsign" value="${escapeHtml(callsign)}" style="width:min(720px, 95%); text-align:center; font-size:14px; padding:5px 8px; box-sizing:border-box;border-radius:0;border: 1px solid #999">
          </div>
          <div style="display:flex; justify-content:center;margin-top:-1px">
            <div style="width:min(720px, 95%);">
              <textarea class="descIn" data-id="${escapeHtml(t.id)}" rows="3" placeholder="Description" style="width:100%; box-sizing:border-box; resize:vertical;padding: 5px">${escapeHtml(t.description || '')}</textarea>
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin:0px 12px 8px 12px">
            <span style="color:#666; font-size:14px; text-align:left; flex:1; min-width:0; overflow-wrap:anywhere;">• <strong>ID</strong>: #${orderLabel} • <strong>Date</strong>: ${escapeHtml(recDate)}<br />• <strong>Duration</strong>: ${seconds}s • <strong>Rate</strong>: ${rateHz} Hz • <strong>Model</strong>: ${escapeHtml(getModelDisplayName(t.modelUrl))}</span>
            <button class="delBtn" data-id="${escapeHtml(t.id)}" style="margin-left:auto; flex-shrink:0;">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    for (const btn of guiWin.document.querySelectorAll('.pilotBtn')) {
      btn.onclick = () => {
        const id = String(btn.dataset.id || '');
        const tr = tracks.find((t) => t.id === id);
        if (!tr) return;
        if (!tr._play?.playing) {
          alert('Start playback for this track first.');
          return;
        }
        setTrackPilotFollow(tr, !tr._pilotFollow);
        updateUi();
      };
    }

    for (const btn of guiWin.document.querySelectorAll('.delBtn')) {
      btn.onclick = () => deleteTrack(btn.dataset.id);
    }

    for (const input of guiWin.document.querySelectorAll('.nameIn')) {
      input.oninput = () => {
        const id = input.dataset.id;
        if (!id) return;
        renameTrack(id, input.value || '');
      };
    }

    for (const input of guiWin.document.querySelectorAll('.descIn')) {
      input.oninput = () => {
        const id = input.dataset.id;
        if (!id) return;
        setTrackDescription(id, input.value || '');
      };
    }

    for (const input of guiWin.document.querySelectorAll('.trackCallsignIn')) {
      input.oninput = () => {
        const id = input.dataset.id;
        if (!id) return;
        const clean = sanitizeCallsign(input.value || '');
        if (input.value !== clean) input.value = clean;
        setTrackCallsign(id, clean);
      };
    }

    for (const cb of guiWin.document.querySelectorAll('input.track-select[type="checkbox"]')) {
      cb.onchange = () => {
        const id = String(cb.dataset.id || '');
        if (id) setTrackSelected(id, !!cb.checked);
        updateRecordingHint();
      };
    }

    updateRecordingHint();
  }

  function updateRecordingHint() {
    if (!guiWin || guiWin.closed || !gui.recHint) return;
    const selectedCount = [...guiWin.document.querySelectorAll('input.track-select[type="checkbox"]:checked')].length;
    gui.recHint.textContent = selectedCount > 0 ? 'While replaying selected playbacks' : '';
  }

  function updatePlaybackControlsUi() {
    if (!guiWin || guiWin.closed) return;
    const mode = getPlaybackUiMode();
    const canInteract = recordState === 'IDLE';

    if (gui.playSelBtn) {
      gui.playSelBtn.style.display = (mode === 'IDLE' || mode === 'PAUSED') ? '' : 'none';
      gui.playSelBtn.disabled = !canInteract;
    }
    if (gui.pauseSelBtn) {
      gui.pauseSelBtn.style.display = (mode === 'PLAYING') ? '' : 'none';
      gui.pauseSelBtn.disabled = !canInteract;
    }
    if (gui.stopSelBtn) {
      gui.stopSelBtn.style.display = (mode === 'IDLE') ? 'none' : '';
      gui.stopSelBtn.disabled = !canInteract;
    }
  }

  function updatePlaybackSliderUi() {
    if (!guiWin || guiWin.closed || !gui.playbackPos || !gui.playbackPosInfo) return;
    const targets = getSliderTracks();
    if (!targets.length) {
      gui.playbackPos.disabled = true;
      if (!playbackSliderDragging) gui.playbackPos.value = '0';
      gui.playbackPosInfo.textContent = 'Playback position: -';
      return;
    }

    const longest = getLongestTimelineTrack(targets);
    const longestDurationMs = Math.max(0, getTrackDurationMs(longest));
    const last = Math.max(0, (longest?.lla?.length || 1) - 1);
    const idx = clamp(Math.floor(longest?._play?.idx || 0), 0, last);
    const elapsedMs = idx * Math.max(1, longest?.sampleMs || 16);
    const ratio = longestDurationMs > 0 ? elapsedMs / longestDurationMs : 0;
    gui.playbackPos.disabled = false;
    if (!playbackSliderDragging) {
      gui.playbackPos.value = String(Math.round(ratio * 1000));
    }

    const elapsedSec = elapsedMs / 1000;
    const totalSec = longestDurationMs / 1000;
    gui.playbackPosInfo.textContent = `Playback position: ${Math.round(ratio * 100)}% (${elapsedSec.toFixed(1)}s / ${totalSec.toFixed(1)}s)`;
  }

  function updateUi() {
    if (!guiWin || guiWin.closed) return;
    if (!gui.recBtn) return;

    const recActive = recordState === 'RECORDING';
    gui.recBtn.textContent = recActive ? 'STOP RECORDING' : 'START RECORDING';
    gui.recBtn.style.background = recActive ? '#024475' : '#c92a2a';

    const addMsgBtn = document.getElementById('addMsgBtn');
    if (addMsgBtn) {
      // Alleen zichtbaar als er een track in "pilot" modus (Fly this track) is
      addMsgBtn.style.display = activePilotTrackId ? 'inline-block' : 'none';
    }

    const canRec = recordState === 'IDLE';

    if (!recActive) gui.recBtn.disabled = !canRec;
    else gui.recBtn.disabled = false;

    updatePlaybackControlsUi();
    if (gui.ultraStrength) {
      gui.ultraStrength.value = String(ultraStrength);
    }
    if (gui.ultraStrengthVal) gui.ultraStrengthVal.textContent = String(ultraStrength);
    if (gui.showCallsignCb) gui.showCallsignCb.checked = !!showCallsign;
    if (gui.rateSel) gui.rateSel.value = String(defaultSampleMs);
    if (gui.callsignIn && gui.callsignIn.value !== recordCallsign) gui.callsignIn.value = recordCallsign;

    renderFlightsList();
    updatePlaybackSliderUi();
    updateLiveStatus();
    emitRecorderDebugEvent();
  }

  function updateLiveStatus() {
    if (!guiWin || guiWin.closed) return;
    updatePlaybackControlsUi();
    updatePlaybackSliderUi();
    const samples = currentRec?.lla?.length || 0;
    const hz = currentRec ? (1000 / currentRec.sampleMs).toFixed(1) : (1000 / defaultSampleMs).toFixed(1);
    if (gui.recStatus) gui.recStatus.textContent = `REC • ${samples} • ${hz} Hz`;

    const playingCount = tracks.filter((t) => t._play.playing && !t._play.paused).length;
    if (gui.info) gui.info.textContent = `recordState=${recordState} • playState=${playState} • tracks=${tracks.length} • playing=${playingCount}`;
  }

  /* ---------- Main RAF ---------- */
  function mainRAF() {
    requestAnimationFrame(mainRAF);
    const t = now();
    const dt = clamp(t - lastMainT, 0, MAX_DT_CAP);
    lastMainT = t;

    if (recordState === 'RECORDING' && currentRec) {
      recordFixedStep(currentRec, dt);
    }

    for (const tr of tracks) {
      if (!tr._play?.playing || tr._play.paused) continue;
      playbackFixedStep(tr, dt);
    }

    updatePlayState();
    if (guiWin && !guiWin.closed && (t - lastUiUpdateT >= UI_UPDATE_INTERVAL_MS)) {
      lastUiUpdateT = t;
      updateLiveStatus();
    }
  }

  /* ---------- Boot ---------- */
  loadRecorderPrefs();
  initEmbeddedUi();
  void loadFromIndexedDB().then(() => {
    updateUi();
  });
  requestAnimationFrame(mainRAF);
})();