// ==UserScript==
// @name         GeoFS Aircraft Builder
// @namespace    https://github.com/ArjanKw/GeoFS-BlueAngels/
// @version      1.0.0
// @description  Build and tune MainPlugin/entrypoint files for new aircraft add-ons.
// @match        https://www.geo-fs.com/*
// @match        https://geo-fs.com/*
// @match        https://*.geo-fs.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const MIN_MFD_SCALE = 0.05;

  const state = {
    sourceMainPlugin: '',
    mainId: 'NEW',
    className: 'NewMainPlugin',
    aircraftId: '',
    addonGlobal: 'NewAddon',
    pluginGlobal: 'NewPlugin',
    entrypointFile: 'geo-fs-new-addon.user.js',
    mfdLayout: [],
    selectedMfdIndex: -1,
    stepPosition: 0.01,
    stepRotation: 0.5,
    stepScale: 0.01,
    generatedMainPlugin: '',
    generatedEntrypoint: ''
  };

  function sanitizeMainId(value) {
    const raw = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!raw) return 'NEW';
    if (!/[A-Z]/.test(raw[0])) return `A${raw}`;
    return raw;
  }

  function applyMainId(value) {
    const mainId = sanitizeMainId(value);
    state.mainId = mainId;
    state.className = `${mainId}MainPlugin`;
    state.addonGlobal = `${mainId}Addon`;
    state.pluginGlobal = `${mainId}Plugin`;
    state.entrypointFile = `geo-fs-${mainId.toLowerCase()}-addon.user.js`;
  }

  function clampScaleValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return MIN_MFD_SCALE;
    return Math.max(MIN_MFD_SCALE, numeric);
  }

  function round3(value) {
    return Number(value.toFixed(3));
  }

  function cleanVec3(vec) {
    return [round3(vec[0]), round3(vec[1]), round3(vec[2])];
  }

  function cleanMfdLayout(layout) {
    return layout.map((mfd) => ({
      ...mfd,
      position: cleanVec3(mfd.position),
      rotation: cleanVec3(mfd.rotation),
      scale: cleanVec3(mfd.scale)
    }));
  }

  function normalizeMfdScale(mfd) {
    if (!mfd || !Array.isArray(mfd.scale)) return;
    mfd.scale = [
      round3(clampScaleValue(mfd.scale[0])),
      round3(clampScaleValue(mfd.scale[1])),
      round3(clampScaleValue(mfd.scale[2]))
    ];
  }

  applyMainId('NEW');

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function formatCode(value) {
    return JSON.stringify(value, null, 2)
      .replace(/\[\s*\n\s*([-0-9.]+),\s*\n\s*([-0-9.]+),\s*\n\s*([-0-9.]+)\s*\n\s*\]/g, '[$1, $2, $3]')
      .replace(/"([^"]+)":/g, '$1:')
      .replace(/"/g, '\'');
  }

  function nextMfdName() {
    const used = new Set(state.mfdLayout.map((mfd) => mfd.name));
    const baseNames = ['LEFT', 'RIGHT', 'CENTER', 'AUX1', 'AUX2', 'AUX3'];
    for (const name of baseNames) {
      if (!used.has(name)) return name;
    }
    let index = 1;
    while (used.has(`MFD${index}`)) index += 1;
    return `MFD${index}`;
  }

  function getSelectedMfd() {
    if (state.selectedMfdIndex < 0 || state.selectedMfdIndex >= state.mfdLayout.length) return null;
    return state.mfdLayout[state.selectedMfdIndex];
  }

  function createAircraftBuilderRuntime() {
    if (window.AircraftBuilderAddon?.mfd) return window.AircraftBuilderAddon.mfd;
    if (!window.MfdModule) return null;

    class AircraftBuilderMainPlugin {
      constructor() {
        this.id = 'AIRCRAFT_BUILDER';
        this.version = '1.0.0';
      }
    }

    const helper = window.HelperModule ? new window.HelperModule() : null;
    const map = window.MapModule ? new window.MapModule() : null;
    const camera = window.CameraModule ? new window.CameraModule(helper, { cockpitViewPresets: [], cameraModeDefinitions: {} }) : null;
    const weapons = window.WeaponModule ? new window.WeaponModule({ ...(window.WeaponModuleDefaults?.fighter || {}), storageKey: 'AircraftBuilderWpnState' }) : null;
    const recorder = window.RecorderModule ? new window.RecorderModule() : null;
    const mfd = new window.MfdModule(helper, map, camera, weapons, recorder);

    window.AircraftBuilderMainPlugin = AircraftBuilderMainPlugin;
    window.AircraftBuilderPlugin = new AircraftBuilderMainPlugin();
    window.AircraftBuilderAddon = {
      helper,
      map,
      camera,
      weapons,
      recorder,
      mfd,
      lifecycle: {
        start: () => {
          mfd.initializeDefaultMfds(state.mfdLayout);
          mfd.startCameraWatch();
          mfd.ensureLoaded();
        },
        stop: () => {
          mfd.restore();
        }
      }
    };

    window.AircraftBuilderAddon.lifecycle.start();
    return mfd;
  }

  function getLiveMfdModule() {
    const addon = window.BasePlugin?.getActiveAddon?.();
    if (addon?.mfd) return addon.mfd;
    return createAircraftBuilderRuntime();
  }

  function syncSelectedMfdToLive(changeType = 'transform') {
    const selected = getSelectedMfd();
    if (!selected) return;
    normalizeMfdScale(selected);
    selected.position = cleanVec3(selected.position);
    selected.rotation = cleanVec3(selected.rotation);

    const mfd = getLiveMfdModule();
    if (!mfd) return;

    if (!mfd.getDisplay(selected.name)) {
      mfd.addMfd(deepClone(selected));
      mfd.ensureLoaded();
    }

    mfd.updateDisplayTransform(selected.name, {
      position: selected.position,
      rotation: selected.rotation,
      scale: selected.scale
    }, {
      applyScale: changeType === 'scale'
    });
  }

  function extractArrayLiteral(source, marker) {
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) return null;

    const firstBracket = source.indexOf('[', markerIndex);
    if (firstBracket < 0) return null;

    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let escaped = false;

    for (let i = firstBracket; i < source.length; i += 1) {
      const ch = source[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }

      if (!inDouble && !inTemplate && ch === '\'') {
        inSingle = !inSingle;
        continue;
      }
      if (!inSingle && !inTemplate && ch === '"') {
        inDouble = !inDouble;
        continue;
      }
      if (!inSingle && !inDouble && ch === '`') {
        inTemplate = !inTemplate;
        continue;
      }
      if (inSingle || inDouble || inTemplate) continue;

      if (ch === '[') depth += 1;
      if (ch === ']') {
        depth -= 1;
        if (depth === 0) {
          return source.slice(firstBracket, i + 1);
        }
      }
    }

    return null;
  }

  function parseMainPluginSource() {
    const source = state.sourceMainPlugin;
    if (!source.trim()) return;

    const ctorIdMatch = source.match(/super\(\s*\{\s*id:\s*['"]([^'"]+)['"]/);
    if (ctorIdMatch) {
      applyMainId(ctorIdMatch[1]);
    }

    const classMatch = source.match(/class\s+([A-Za-z0-9_]+)\s+extends\s+window\.BasePlugin/);
    if (classMatch) {
      state.className = classMatch[1];
      state.pluginGlobal = classMatch[1].replace('MainPlugin', 'Plugin');
      state.addonGlobal = classMatch[1].replace('MainPlugin', 'Addon');
      const classIdMatch = classMatch[1].match(/^([A-Za-z0-9]+)MainPlugin$/);
      if (classIdMatch) {
        applyMainId(classIdMatch[1]);
      }
    }

    const idMatch = source.match(/static\s+AIRCRAFT_ID\s*=\s*['"]([^'"]+)['"]/);
    if (idMatch) {
      state.aircraftId = idMatch[1];
    }

    const layoutLiteral = extractArrayLiteral(source, 'static DEFAULT_MFD_LAYOUT');
    if (layoutLiteral) {
      const parsed = Function(`"use strict"; return (${layoutLiteral});`)();
      state.mfdLayout = cleanMfdLayout(deepClone(parsed));
      state.mfdLayout.forEach(normalizeMfdScale);
      state.selectedMfdIndex = state.mfdLayout.length ? 0 : -1;
    }
  }

  function patchSourceWithCurrentValues() {
    let source = state.sourceMainPlugin;
    if (!source.trim()) return '';

    source = source.replace(/static\s+AIRCRAFT_ID\s*=\s*['"][^'"]+['"]/g, `static AIRCRAFT_ID = '${state.aircraftId}'`);

    const layoutLiteral = extractArrayLiteral(source, 'static DEFAULT_MFD_LAYOUT');
    if (layoutLiteral) {
      const replacement = formatCode(cleanMfdLayout(state.mfdLayout));
      source = source.replace(layoutLiteral, replacement);
    }

    return source;
  }

  function generateMainPluginTemplate() {
    const className = state.className || 'NewMainPlugin';
    const addonGlobal = state.addonGlobal || className.replace('MainPlugin', 'Addon');
    const pluginId = (state.mainId || className.replace('MainPlugin', '') || 'new').toLowerCase();
    return `(function () {\n  'use strict';\n\n  class ${className} extends window.BasePlugin {\n    static AIRCRAFT_ID = '${state.aircraftId}';\n    static DEFAULT_MFD_LAYOUT = ${formatCode(cleanMfdLayout(state.mfdLayout))};\n\n    static CAMERA_CONFIG = {\n      cockpitViewPresets: [],\n      cameraModeDefinitions: {}\n    };\n\n    constructor(config = {}) {\n      super({ id: '${pluginId}', version: config.version ?? '2.0.0' });\n      OptionModule.initializeStorageKey(this.id, '${addonGlobal}Options');\n\n      window.${addonGlobal} = {\n        version: this.version,\n        options: {\n          buildKey: OptionModule.buildOptionKey,\n          read: OptionModule.readOptions,\n          write: OptionModule.writeOptions,\n          get: OptionModule.getOption,\n          set: OptionModule.setOption,\n          getValue: OptionModule.getOptionValue\n        },\n        weapons: new WeaponModule({\n          ...window.WeaponModuleDefaults?.fighter,\n          storageKey: '${addonGlobal}WpnState'\n        }),\n        checklists: ChecklistModule.loadDefaults('fighter') ?? new ChecklistModule(),\n        helper: new HelperModule(),\n        map: null,\n        nav: null,\n        communication: new CommunicationModule(),\n        system: new SystemModule(),\n        hud: new F18HudModule(),\n        camera: null,\n        fmc: new FMCModule(),\n        controls: null,\n        recorder: new RecorderModule(),\n        mfd: MfdModule,\n        lifecycle: {\n          start: () => this.start(),\n          stop: () => this.stop(),\n          restart: () => this.restart(),\n          isRunning: () => this.isRunning()\n        }\n      };\n\n      window.${addonGlobal}.camera = new CameraModule(window.${addonGlobal}.helper, ${className}.CAMERA_CONFIG);\n      window.${addonGlobal}.controls = new ControlModule(window.${addonGlobal}.helper);\n      window.${addonGlobal}.nav = new NavModule();\n      window.${addonGlobal}.map = new MapModule();\n      window.${addonGlobal}.nav.setMapModule(window.${addonGlobal}.map);\n      window.${addonGlobal}.map.setNavModule(window.${addonGlobal}.nav);\n\n      window.${addonGlobal}.mfd = new MfdModule(\n        window.${addonGlobal}.helper,\n        window.${addonGlobal}.map,\n        window.${addonGlobal}.camera,\n        window.${addonGlobal}.weapons,\n        window.${addonGlobal}.recorder\n      );\n\n      window.${addonGlobal}.checklists.registerMfdPages(window.${addonGlobal}.mfd);\n      window.${addonGlobal}.nav.registerMfdPages(window.${addonGlobal}.mfd);\n      window.${addonGlobal}.weapons.registerMfdPages(window.${addonGlobal}.mfd);\n      window.${addonGlobal}.hud.registerMfdPages(window.${addonGlobal}.mfd);\n      window.${addonGlobal}.recorder.registerMfdPages(window.${addonGlobal}.mfd);\n      window.${addonGlobal}.communication.registerMfdPages(window.${addonGlobal}.mfd);\n      window.${addonGlobal}.system.registerMfdPages(window.${addonGlobal}.mfd);\n\n      this.setManagedModules([window.${addonGlobal}.controls]);\n    }\n\n    isAircraftActive() {\n      return window.geofs?.aircraft?.instance?.id === ${className}.AIRCRAFT_ID;\n    }\n\n    getMfdPages() {\n      return window.${addonGlobal}.mfd.pageRegistry;\n    }\n\n    tryInstall() {\n      return window.${addonGlobal}.mfd.ensureLoaded();\n    }\n\n    start() {\n      if (!this.startLifecycle()) return;\n      window.${addonGlobal}.mfd.initializeDefaultMfds(${className}.DEFAULT_MFD_LAYOUT);\n      window.${addonGlobal}.mfd.startCameraWatch();\n      this.tickActive();\n    }\n\n    tickActive() {\n      this.runInstallTick('${className}', () => this.tryInstall());\n    }\n\n    stop() {\n      if (!this.stopLifecycle()) return;\n      window.${addonGlobal}.mfd.restore();\n    }\n\n    restart() {\n      this.stop();\n      this.start();\n    }\n\n    isRunning() {\n      return this.running;\n    }\n  }\n\n  window.${className} = ${className};\n})();\n`;
  }

  function generateEntrypointTemplate() {
    const className = state.className || 'NewMainPlugin';
    const pluginGlobal = state.pluginGlobal || className.replace('MainPlugin', 'Plugin');

    return `// ==UserScript==\n// @name         GeoFS ${className} Entry\n// @namespace    https://github.com/ArjanKw/GeoFS-BlueAngels/\n// @version      2.0.0\n// @description  Entrypoint for ${className}.\n// @match        https://www.geo-fs.com/*\n// @match        https://geo-fs.com/*\n// @match        https://*.geo-fs.com/*\n// @grant        none\n// ==/UserScript==\n\n(function () {\n  'use strict';\n\n  const VERSION = '2.0.0';\n  const PluginCtor = window.${className};\n  if (typeof PluginCtor !== 'function') return;\n\n  const plugin = new PluginCtor({ version: VERSION });\n  window.${pluginGlobal} = plugin;\n  window.BasePlugin.registerPlugin(plugin);\n})();\n`;
  }

  function generateOutputs() {
    const patched = patchSourceWithCurrentValues();
    state.generatedMainPlugin = patched || generateMainPluginTemplate();
    state.generatedEntrypoint = generateEntrypointTemplate();
  }

  function downloadTextFile(fileName, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function createButton(label, onClick) {
    const button = document.createElement('button');
    button.textContent = label;
    button.style.margin = '2px';
    button.style.padding = '4px 8px';
    button.style.background = '#1f2937';
    button.style.color = '#fff';
    button.style.border = '1px solid #374151';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    button.onclick = onClick;
    return button;
  }

  function createNumberInput(value, onInput, width = '70px', options = {}) {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value);
    input.step = String(options.step ?? 0.001);
    if (Number.isFinite(options.min)) input.min = String(options.min);
    input.style.width = width;
    input.style.background = '#111827';
    input.style.color = '#fff';
    input.style.border = '1px solid #374151';
    input.oninput = () => onInput(Number(input.value));
    return input;
  }

  function createSection(parent, title, openByDefault = true) {
    const section = document.createElement('details');
    section.open = openByDefault;
    section.style.marginTop = '8px';
    section.style.border = '1px solid #374151';
    section.style.borderRadius = '6px';
    section.style.padding = '6px';

    const summary = document.createElement('summary');
    summary.textContent = title;
    summary.style.cursor = 'pointer';
    summary.style.fontWeight = '700';
    section.appendChild(summary);

    const body = document.createElement('div');
    body.style.marginTop = '8px';
    section.appendChild(body);

    parent.appendChild(section);
    return body;
  }

  function mountBuilder() {
    const panel = document.createElement('div');
    panel.style.position = 'fixed';
    panel.style.top = '12px';
    panel.style.right = '12px';
    panel.style.width = '540px';
    panel.style.maxHeight = '92vh';
    panel.style.overflow = 'auto';
    panel.style.zIndex = '999999';
    panel.style.background = '#0b1220';
    panel.style.color = '#e5e7eb';
    panel.style.border = '1px solid #374151';
    panel.style.borderRadius = '8px';
    panel.style.padding = '10px';
    panel.style.fontFamily = 'monospace';
    document.body.appendChild(panel);

    const swallowGeoFsKeybinds = (event) => {
      event.stopPropagation();
    };

    panel.addEventListener('keydown', swallowGeoFsKeybinds);
    panel.addEventListener('keyup', swallowGeoFsKeybinds);
    panel.addEventListener('keypress', swallowGeoFsKeybinds);

    const title = document.createElement('div');
    title.textContent = 'Aircraft Builder';
    title.style.fontWeight = '700';
    title.style.marginBottom = '8px';
    panel.appendChild(title);

    const loadBody = createSection(panel, 'Load', true);
    const mainBody = createSection(panel, 'Main', false);
    const mfdBody = createSection(panel, 'MFD', false);
    const exportBody = createSection(panel, 'Export', false);

    const sourceArea = document.createElement('textarea');
    sourceArea.placeholder = 'Paste MainPlugin.js source here (optional).';
    sourceArea.style.width = '100%';
    sourceArea.style.height = '120px';
    sourceArea.style.background = '#111827';
    sourceArea.style.color = '#fff';
    sourceArea.style.border = '1px solid #374151';
    loadBody.appendChild(sourceArea);

    const topActions = document.createElement('div');
    topActions.appendChild(createButton('Load source', () => {
      state.sourceMainPlugin = sourceArea.value;
      parseMainPluginSource();
      refresh();
    }));
    topActions.appendChild(createButton('Start empty', () => {
      state.sourceMainPlugin = '';
      applyMainId('NEW');
      state.aircraftId = '';
      state.mfdLayout = [];
      state.selectedMfdIndex = -1;
      refresh();
    }));
    loadBody.appendChild(topActions);

    const mainIdInfo = document.createElement('div');
    mainIdInfo.textContent = 'Id: short, unique per aircraft, uppercase letters/numbers only, starts with an uppercase letter (e.g. F18, F15).';
    mainIdInfo.style.fontSize = '11px';
    mainIdInfo.style.opacity = '0.9';
    mainIdInfo.style.marginBottom = '4px';
    mainBody.appendChild(mainIdInfo);

    const mainIdInput = document.createElement('input');
    mainIdInput.style.width = '100%';
    mainIdInput.style.marginTop = '4px';
    mainIdInput.style.background = '#111827';
    mainIdInput.style.color = '#fff';
    mainIdInput.style.border = '1px solid #374151';
    mainIdInput.placeholder = 'Id (e.g. F18)';
    mainBody.appendChild(mainIdInput);

    const idInput = document.createElement('input');
    idInput.style.width = '100%';
    idInput.style.marginTop = '6px';
    idInput.style.background = '#111827';
    idInput.style.color = '#fff';
    idInput.style.border = '1px solid #374151';
    idInput.placeholder = 'AIRCRAFT_ID';
    mainBody.appendChild(idInput);

    const mfdRow = document.createElement('div');
    mfdRow.style.marginTop = '4px';

    const mfdSelect = document.createElement('select');
    mfdSelect.style.width = '220px';
    mfdSelect.style.background = '#111827';
    mfdSelect.style.color = '#fff';
    mfdSelect.style.border = '1px solid #374151';
    mfdRow.appendChild(mfdSelect);

    mfdRow.appendChild(createButton('Add MFD', () => {
      const name = nextMfdName();
      state.mfdLayout.push({
        name,
        position: [0, 6.158, 0.584],
        rotation: [8, 0, 0],
        scale: [Math.max(0.29, MIN_MFD_SCALE), Math.max(0.29, MIN_MFD_SCALE), Math.max(0.285, MIN_MFD_SCALE)],
        defaultPageTitle: 'NAV'
      });
      state.selectedMfdIndex = state.mfdLayout.length - 1;
      refresh();
      syncSelectedMfdToLive();
    }));

    mfdRow.appendChild(createButton('Remove', () => {
      if (state.selectedMfdIndex < 0) return;
      state.mfdLayout.splice(state.selectedMfdIndex, 1);
      state.selectedMfdIndex = state.mfdLayout.length ? Math.min(state.selectedMfdIndex, state.mfdLayout.length - 1) : -1;
      refresh();
    }));

    mfdBody.appendChild(mfdRow);

    const stepsRow = document.createElement('div');
    stepsRow.style.marginTop = '6px';
    stepsRow.append('Step pos ', createNumberInput(state.stepPosition, (v) => { state.stepPosition = v || 0.01; }));
    stepsRow.append(' rot ', createNumberInput(state.stepRotation, (v) => { state.stepRotation = v || 0.5; }));
    stepsRow.append(' scale ', createNumberInput(state.stepScale, (v) => { state.stepScale = Math.max(v || 0.01, 0.001); }));
    mfdBody.appendChild(stepsRow);

    const transformEditor = document.createElement('div');
    transformEditor.style.marginTop = '8px';
    transformEditor.style.display = 'grid';
    transformEditor.style.gridTemplateColumns = '1fr 1fr 1fr';
    transformEditor.style.gap = '8px';
    mfdBody.appendChild(transformEditor);

    const generatedMain = document.createElement('textarea');
    generatedMain.style.width = '100%';
    generatedMain.style.height = '160px';
    generatedMain.style.marginTop = '4px';
    generatedMain.style.background = '#111827';
    generatedMain.style.color = '#fff';
    generatedMain.style.border = '1px solid #374151';
    exportBody.appendChild(generatedMain);

    const generatedEntry = document.createElement('textarea');
    generatedEntry.style.width = '100%';
    generatedEntry.style.height = '130px';
    generatedEntry.style.marginTop = '8px';
    generatedEntry.style.background = '#111827';
    generatedEntry.style.color = '#fff';
    generatedEntry.style.border = '1px solid #374151';
    exportBody.appendChild(generatedEntry);

    const outputActions = document.createElement('div');
    outputActions.style.marginTop = '6px';
    outputActions.appendChild(createButton('Generate files', () => {
      generateOutputs();
      refresh();
    }));
    outputActions.appendChild(createButton('Download MainPlugin.js', () => {
      generateOutputs();
      refresh();
      downloadTextFile(`${state.className}.js`, state.generatedMainPlugin);
    }));
    outputActions.appendChild(createButton('Download entrypoint', () => {
      generateOutputs();
      refresh();
      downloadTextFile(state.entrypointFile, state.generatedEntrypoint);
    }));
    exportBody.appendChild(outputActions);

    function createAxisRow(arrayName, axisIndex, stepResolver) {
      const row = document.createElement('div');
      row.style.marginTop = '3px';
      row.textContent = `${axisIndex === 0 ? 'X' : axisIndex === 1 ? 'Y' : 'Z'} `;

      row.appendChild(createButton('-', () => {
        const selected = getSelectedMfd();
        if (!selected) return;
        const nextValue = selected[arrayName][axisIndex] - stepResolver();
        selected[arrayName][axisIndex] = arrayName === 'scale' ? round3(clampScaleValue(nextValue)) : round3(nextValue);
        refresh();
        syncSelectedMfdToLive(arrayName === 'scale' ? 'scale' : 'transform');
      }));

      row.appendChild(createButton('+', () => {
        const selected = getSelectedMfd();
        if (!selected) return;
        const nextValue = selected[arrayName][axisIndex] + stepResolver();
        selected[arrayName][axisIndex] = arrayName === 'scale' ? round3(clampScaleValue(nextValue)) : round3(nextValue);
        refresh();
        syncSelectedMfdToLive(arrayName === 'scale' ? 'scale' : 'transform');
      }));

      const valueInput = createNumberInput(0, (value) => {
        const selected = getSelectedMfd();
        if (!selected || !Number.isFinite(value)) return;
        selected[arrayName][axisIndex] = arrayName === 'scale' ? round3(clampScaleValue(value)) : round3(value);
        refresh();
        syncSelectedMfdToLive(arrayName === 'scale' ? 'scale' : 'transform');
      }, '75px', arrayName === 'scale' ? { min: MIN_MFD_SCALE, step: 0.001 } : { step: 0.001 });
      row.appendChild(valueInput);

      return { row, valueInput };
    }

    function createTransformColumn(titleText, arrayName, stepResolver) {
      const column = document.createElement('div');
      column.style.border = '1px solid #374151';
      column.style.borderRadius = '6px';
      column.style.padding = '6px';

      const titleEl = document.createElement('div');
      titleEl.textContent = titleText;
      titleEl.style.fontWeight = '700';
      titleEl.style.marginBottom = '4px';
      column.appendChild(titleEl);

      const rows = [0, 1, 2].map((i) => createAxisRow(arrayName, i, stepResolver));
      rows.forEach((r) => column.appendChild(r.row));
      return { column, rows };
    }

    const positionColumn = createTransformColumn('Position', 'position', () => state.stepPosition);
    const rotationColumn = createTransformColumn('Rotation', 'rotation', () => state.stepRotation);
    const scaleColumn = createTransformColumn('Scale', 'scale', () => state.stepScale);

    const axisRows = {
      position: positionColumn.rows,
      rotation: rotationColumn.rows,
      scale: scaleColumn.rows
    };

    transformEditor.appendChild(positionColumn.column);
    transformEditor.appendChild(rotationColumn.column);
    transformEditor.appendChild(scaleColumn.column);

    mainIdInput.oninput = () => {
      applyMainId(mainIdInput.value);
      mainIdInput.value = state.mainId;
      refresh();
    };

    idInput.oninput = () => {
      state.aircraftId = idInput.value;
    };

    mfdSelect.onchange = () => {
      state.selectedMfdIndex = Number(mfdSelect.value);
      refresh();
    };

    function refresh() {
      mainIdInput.value = state.mainId;
      idInput.value = state.aircraftId;

      mfdSelect.innerHTML = '';
      state.mfdLayout.forEach((mfd, index) => {
        normalizeMfdScale(mfd);
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${mfd.name}`;
        if (index === state.selectedMfdIndex) option.selected = true;
        mfdSelect.appendChild(option);
      });

      const selected = getSelectedMfd();
      const vectors = ['position', 'rotation', 'scale'];
      for (const vectorName of vectors) {
        const rows = axisRows[vectorName];
        for (let i = 0; i < rows.length; i += 1) {
          rows[i].valueInput.value = selected ? String(selected[vectorName][i]) : '0';
        }
      }

      generateOutputs();
      generatedMain.value = state.generatedMainPlugin;
      generatedEntry.value = state.generatedEntrypoint;
    }

    refresh();
  }

  mountBuilder();
})();
