// MfdDisplay - Individual MFD screen instance (LEFT, RIGHT, CENTER, etc.)
class MfdDisplay {
  static DEFAULTS = {
    MFD_BASE_SCALE: [0.29, 0.29, 0.285],
    MFD_BUTTON_BASE_SCALE: [0.047, 0.047, 0.047],
    MFD_BUTTON_COUNT: 5,
    MFD_BUTTON_START_X: -0.048,
    MFD_BUTTON_STEP_X: 0.023,
    MFD_BUTTON_Y: -0.01,
    MFD_BUTTON_Z_OFFSET: 0.083,
    MFD_LEFT_BUTTON_X: -0.085,
    MFD_RIGHT_BUTTON_X: 0.0835,
    MFD_SIDE_BUTTON_Y: -0.01,
    MFD_SIDE_BUTTON_START_Z: 0.05,
    MFD_SIDE_BUTTON_STEP_Z: 0.023,
    MFD_TOP_BUTTON_VISUAL_SCALE: 2 / 3,
    MFD_CLICK_HALF_WIDTH: 0.36,
    MFD_CLICK_HALF_HEIGHT: 0.36,
    MFD_PART_MODEL_URL: 'https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/models/glassPanel.gltf',
    MFD_TRANSPARENT_PART_MODEL_URL: 'https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/models/glassPanel-transparent.gltf'
  };

  constructor(mfdModule, config = {}) {
    this.mfdModule = mfdModule;
    this.cfg = {
      ...MfdDisplay.DEFAULTS,
      name: 'RIGHT',
      position: [0.2167, 6.158, 0.584],
      rotation: [8, 0, 0],
      scale: [0.29, 0.29, 0.285],
      parentPartName: null,
      defaultPageTitle: null,
      ...config
    };

    this.slotName = this.cfg.name;
    this.slotNameLower = this.slotName.toLowerCase();
    this.names = {
      MFD_RENDERER_NAME: `mfdRenderer${this.slotName}`,
      MFD_INCLUDE_KEY: `mfd-include-${this.slotNameLower}`,
      MFD_PART_NAME: `mfdPart${this.slotName}`,
      MFD_TOP_BUTTON_RENDERER_NAME: `mfdTopButtonRenderer${this.slotName}`,
      MFD_TOP_BUTTON_INCLUDE_KEY_BASE: `mfd-top-button-include-${this.slotNameLower}`,
      MFD_TOP_BUTTON_PART_NAME_BASE: `mfdTopButtonPart${this.slotName}_`,
      MFD_BOTTOM_BUTTON_PART_NAME_BASE: `mfdBottomButtonPart${this.slotName}_`,
      MFD_LEFT_BUTTON_PART_NAME_BASE: `mfdLeftButtonPart${this.slotName}_`,
      MFD_RIGHT_BUTTON_PART_NAME_BASE: `mfdRightButtonPart${this.slotName}_`
    };

    this.uiState = new F18MfdUiState({
      mapModule: this.mfdModule.mapModule,
      weaponsModule: this.mfdModule.weaponsModule,
      recorderModule: this.mfdModule.recorderModule
    }, this.mfdModule.pageRegistry);

    this.nodeClickHandlerInstalled = false;
    this.onNodeClickBound = this.onNodeClick.bind(this);
    this.defaultPageApplied = false;
    this.installed = false;
  }

  get partName() {
    return this.names.MFD_PART_NAME;
  }

  getTopButtonPartName(index) {
    return `${this.names.MFD_TOP_BUTTON_PART_NAME_BASE}${index}`;
  }

  getLeftButtonPartName(index) {
    return `${this.names.MFD_LEFT_BUTTON_PART_NAME_BASE}${index}`;
  }

  getBottomButtonPartName(index) {
    return `${this.names.MFD_BOTTOM_BUTTON_PART_NAME_BASE}${index}`;
  }

  getRightButtonPartName(index) {
    return `${this.names.MFD_RIGHT_BUTTON_PART_NAME_BASE}${index}`;
  }

  getButtonPartName(side, index) {
    if (side === 'top') return this.getTopButtonPartName(index);
    if (side === 'bottom') return this.getBottomButtonPartName(index);
    if (side === 'left') return this.getLeftButtonPartName(index);
    return this.getRightButtonPartName(index);
  }

  getButtonBasePosition(side, index) {
    if (side === 'top') {
      return [
        this.cfg.MFD_BUTTON_START_X + index * this.cfg.MFD_BUTTON_STEP_X,
        this.cfg.MFD_BUTTON_Y,
        Math.abs(this.cfg.MFD_BUTTON_Z_OFFSET)
      ];
    }

    if (side === 'bottom') {
      return [
        this.cfg.MFD_BUTTON_START_X + index * this.cfg.MFD_BUTTON_STEP_X,
        this.cfg.MFD_BUTTON_Y,
        -Math.abs(this.cfg.MFD_BUTTON_Z_OFFSET)
      ];
    }

    if (side === 'left') {
      return [
        this.cfg.MFD_LEFT_BUTTON_X,
        this.cfg.MFD_SIDE_BUTTON_Y,
        this.cfg.MFD_SIDE_BUTTON_START_Z - index * this.cfg.MFD_SIDE_BUTTON_STEP_Z
      ];
    }

    return [
      this.cfg.MFD_RIGHT_BUTTON_X,
      this.cfg.MFD_SIDE_BUTTON_Y,
      this.cfg.MFD_SIDE_BUTTON_START_Z - index * this.cfg.MFD_SIDE_BUTTON_STEP_Z
    ];
  }

  getMfdScaleRatios() {
    const scale = this.cfg.scale;
    const base = this.cfg.MFD_BASE_SCALE;
    return [
      scale[0] / base[0],
      scale[1] / base[1],
      scale[2] / base[2]
    ];
  }

  scaleButtonLocalPosition(basePosition) {
    const [sx, sy, sz] = this.getMfdScaleRatios();
    return [
      basePosition[0] * sx,
      basePosition[1] * sy,
      basePosition[2] * sz
    ];
  }

  getScaledButtonPartScale() {
    const [sx, sy, sz] = this.getMfdScaleRatios();
    const base = this.cfg.MFD_BUTTON_BASE_SCALE;
    return [base[0] * sx, base[1] * sy, base[2] * sz];
  }

  applyDefaultPage() {
    if (this.defaultPageApplied) return;
    const desiredTitle = this.cfg.defaultPageTitle;
    if (!desiredTitle) return;

    const idx = this.uiState.pages.findIndex((p) => p.title === desiredTitle);
    if (idx >= 0) {
      this.uiState.setPage(idx);
    }
    this.defaultPageApplied = true;
  }

  renderMfdButton(renderer) {
    const ctx = renderer.canvasAPI.context;
    const w = renderer.canvasAPI.canvas.width;
    const h = renderer.canvasAPI.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const outerSize = Math.min(w, h) * this.cfg.MFD_TOP_BUTTON_VISUAL_SCALE;
    const outerRadius = outerSize * 0.20;
    const innerInset = outerSize * 0.24;
    const innerSize = outerSize - innerInset * 2;
    const innerRadius = innerSize * 0.36;

    renderer.canvasAPI.clear('#000000');

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    const outerX = cx - outerSize / 2;
    const outerY = cy - outerSize / 2;

    ctx.beginPath();
    ctx.roundRect(outerX, outerY, outerSize, outerSize, outerRadius);
    ctx.fillStyle = '#222120';
    ctx.fill();

    ctx.lineWidth = Math.max(2, outerSize * 0.045);
    ctx.strokeStyle = '#0f0f0e';
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(outerX + innerInset, outerY + innerInset, innerSize, innerSize, innerRadius);
    ctx.fillStyle = '#3a3835';
    ctx.fill();

    ctx.lineWidth = Math.max(1.2, outerSize * 0.018);
    ctx.strokeStyle = '#2f2d2a';
    ctx.stroke();
    ctx.restore();
  }

  ensureMainRendererFunction() {
    const self = this;
    window.instruments.renderers[this.names.MFD_RENDERER_NAME] = (renderer) => {
      if (self.uiState.render) {
        self.uiState.render(renderer);
        return;
      }

      const ctx = renderer.canvasAPI.context;
      const w = renderer.canvasAPI.canvas.width;
      const h = renderer.canvasAPI.canvas.height;
      renderer.canvasAPI.clear('#000000');
      const fallbackBaseColor = OptionModule.getOptionValue('HUD', 'COLOR', '#00ff00');
      ctx.fillStyle = MfdModule.applyBrightnessToHexColor(fallbackBaseColor, MfdModule.getMfdBrightnessFactor());
      ctx.font = `bold ${Math.round(h * 0.18)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.fillText('MFD INIT', w / 2, h / 2);
    };

    return true;
  }

  ensureButtonRendererFunction() {
    const self = this;
    window.instruments.renderers[this.names.MFD_TOP_BUTTON_RENDERER_NAME] = (renderer) => {
      self.renderMfdButton(renderer);
    };

    return true;
  }

  ensureIncludeDefinition(includeKey, rendererName, modelUrl) {
    window.geofs.includes = window.geofs.includes || {};
    if (window.geofs.includes[includeKey]) return true;

    window.geofs.includes[includeKey] = [{
      model: {
        url: modelUrl,
        shader: {
          name: 'generic',
          textures: { diffuse: '' }
        },
        translucent: true,
        opaque: false
      },
      safeTransparency: true,
      renderer: {
        name: rendererName,
        width: 512,
        height: 512,
        enableTransparency: true,
        images: { }
      },
      animations: [{
        type: 'render',
        value: 'geofsTime'
      }],
      shadows: 'SHADOWS_NONE'
    }];

    return true;
  }

  ensureMainIncludeDefinition() {
    return this.ensureIncludeDefinition(
      this.names.MFD_INCLUDE_KEY,
      this.names.MFD_RENDERER_NAME,
      `${this.cfg.MFD_PART_MODEL_URL}?v=${encodeURIComponent(this.names.MFD_RENDERER_NAME)}`
    );
  }

  getButtonIncludeKey(partName) {
    return `${this.names.MFD_TOP_BUTTON_INCLUDE_KEY_BASE}-${partName}`;
  }

  ensureButtonIncludeDefinition(partName) {
    return this.ensureIncludeDefinition(
      this.getButtonIncludeKey(partName),
      this.names.MFD_TOP_BUTTON_RENDERER_NAME,
      `${this.cfg.MFD_TRANSPARENT_PART_MODEL_URL}?v=mfd-button-${encodeURIComponent(partName)}`
    );
  }

  registerButtonPickNode(partName, nodeName) {
    const part = window.geofs.aircraft.instance.parts[partName];
    if (!part) return false;

    const nodesByName = part.object3d?.model?._model?._nodesByName;
    if (!nodesByName) return false;

    // Flexibele fallback: pak 'glassPanel' of de eerste beschikbare node
    let targetNode = nodesByName.glassPanel;
    if (!targetNode) {
      const keys = Object.keys(nodesByName);
      if (keys.length > 0) targetNode = nodesByName[keys[0]];
    }
    if (!targetNode) return false;

    targetNode.name = nodeName;
    nodesByName[nodeName] = targetNode;
    return true;
  }

  installButtonGroup(side) {
    const aircraft = window.geofs.aircraft.instance;
    if (!aircraft.parts[this.names.MFD_PART_NAME]) return false;

    const count = this.cfg.MFD_BUTTON_COUNT;
    const partsToAdd = [];

    for (let i = 0; i < count; i++) {
      const partName = this.getButtonPartName(side, i);
      if (aircraft.parts[partName]) continue;
      if (!this.ensureButtonIncludeDefinition(partName)) return false;

      const position = this.scaleButtonLocalPosition(this.getButtonBasePosition(side, i));

      partsToAdd.push({
        name: partName,
        include: this.getButtonIncludeKey(partName),
        parent: this.names.MFD_PART_NAME,
        position,
        scale: this.getScaledButtonPartScale(),
        shadows: 'SHADOWS_NONE'
      });
    }

    if (partsToAdd.length) {
      aircraft.addParts(partsToAdd);
    }

    for (let i = 0; i < count; i++) {
      const partName = this.getButtonPartName(side, i);
      if (!aircraft.parts[partName]) return false;
      if (!this.registerButtonPickNode(partName, partName)) {
        aircraft.parts[partName]['3dmodel'].readyPromise.then(() => {
          this.registerButtonPickNode(partName, partName);
        });
      }
    }

    return true;
  }

  ensureMfdParts() {
    const aircraft = window.geofs.aircraft.instance;
    const parentPartName = this.cfg.parentPartName || this.mfdModule.getDefaultParentPartName();

    if (this.installed) {
      const existingPart = aircraft.parts[this.names.MFD_PART_NAME];
      if (existingPart) {
        if (!this.cfg.parentPartName && existingPart.parent === 'root' && parentPartName !== 'root') {
          this.removeParts();
          this.installed = false;
        } else {
          return true;
        }
      }
      this.installed = false;
    }

    if (!this.ensureMainRendererFunction()) return false;
    if (!this.ensureMainIncludeDefinition()) return false;
    if (!this.ensureButtonRendererFunction()) return false;

    if (!aircraft.parts[this.names.MFD_PART_NAME]) {
      aircraft.addParts([{
        name: this.names.MFD_PART_NAME,
        include: this.names.MFD_INCLUDE_KEY,
        parent: parentPartName,
        position: this.cfg.position,
        rotation: this.cfg.rotation,
        scale: this.cfg.scale,
        points: {
          topLeft: [-this.cfg.MFD_CLICK_HALF_WIDTH, 0, this.cfg.MFD_CLICK_HALF_HEIGHT],
          topRight: [this.cfg.MFD_CLICK_HALF_WIDTH, 0, this.cfg.MFD_CLICK_HALF_HEIGHT],
          bottomLeft: [-this.cfg.MFD_CLICK_HALF_WIDTH, 0, -this.cfg.MFD_CLICK_HALF_HEIGHT],
          bottomRight: [this.cfg.MFD_CLICK_HALF_WIDTH, 0, -this.cfg.MFD_CLICK_HALF_HEIGHT]
        }
      }]);
    }

    const mfdPart = aircraft.parts[this.names.MFD_PART_NAME];
    if (!mfdPart) return false;

    const registerMainPickNode = () => {
      const nodesByName = mfdPart.object3d?.model?._model?._nodesByName;
      if (!nodesByName) return false;

      let glassNode = nodesByName.glassPanel;
      if (!glassNode) {
        const keys = Object.keys(nodesByName);
        if (keys.length > 0) glassNode = nodesByName[keys[0]];
      }
      if (!glassNode) return false;

      glassNode.name = this.names.MFD_PART_NAME;
      nodesByName[this.names.MFD_PART_NAME] = glassNode;
      return true;
    };

    if (!registerMainPickNode()) {
      mfdPart['3dmodel'].readyPromise.then(() => registerMainPickNode());
    }

    if (!this.installButtonGroup('top')) return false;
    if (!this.installButtonGroup('bottom')) return false;
    if (!this.installButtonGroup('left')) return false;
    if (!this.installButtonGroup('right')) return false;

    this.installed = true;
    return true;
  }

  removePartByName(partName) {
    const ac = window.geofs.aircraft.instance;
    const part = ac.parts[partName];
    if (!part) return;

    const parent = part.object3d.getParent();
    if (parent._children) {
      const idx = parent._children.indexOf(part.object3d);
      if (idx >= 0) parent._children.splice(idx, 1);
    }
    part.object3d.destroy();
    part.rendererInstance?.destroy();
    part['3dmodel']?.destroy();
    delete ac.parts[partName];
  }

  removeParts() {
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      this.removePartByName(this.getTopButtonPartName(i));
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      this.removePartByName(this.getBottomButtonPartName(i));
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      this.removePartByName(this.getLeftButtonPartName(i));
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      this.removePartByName(this.getRightButtonPartName(i));
    }
    this.removePartByName(this.names.MFD_PART_NAME);
    this.installed = false;
  }

  hasRequiredNodeClickHandlers() {
    const handlers = window.controls.nodeClickHandlers;
    if (handlers[this.names.MFD_PART_NAME] !== this.onNodeClickBound) return false;
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      if (handlers[this.getTopButtonPartName(i)] !== this.onNodeClickBound) return false;
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      if (handlers[this.getBottomButtonPartName(i)] !== this.onNodeClickBound) return false;
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      if (handlers[this.getLeftButtonPartName(i)] !== this.onNodeClickBound) return false;
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      if (handlers[this.getRightButtonPartName(i)] !== this.onNodeClickBound) return false;
    }
    return true;
  }

  ensureLoaded() {
    this.applyDefaultPage();
    if (!this.ensureMfdParts()) return false;

    if (this.nodeClickHandlerInstalled && !this.hasRequiredNodeClickHandlers()) {
      this.nodeClickHandlerInstalled = false;
    }
    this.installNodeClickHandler();
    return this.hasRequiredNodeClickHandlers();
  }

  applyTransformToLiveParts(changes = {}) {
    const aircraft = window.geofs?.aircraft?.instance;
    if (!aircraft?.parts) return false;

    const mfdPart = aircraft.parts[this.names.MFD_PART_NAME];
    const mfdObj = mfdPart?.object3d;
    if (!mfdPart || !mfdObj) return false;

    if (changes.position) {
      mfdPart.position = [...this.cfg.position];
      mfdObj.setInitialPosition(mfdPart.position);
    }
    if (changes.rotation) {
      mfdPart.rotation = V3.toRadians([...this.cfg.rotation]);
      mfdObj.setInitialRotation(mfdPart.rotation);
    }
    if (changes.scale) {
      mfdPart.scale = [...this.cfg.scale];
      mfdPart.originalScale = [...mfdPart.scale];
      mfdObj.setInitialScale(mfdPart.scale);
      mfdObj.setScale(mfdPart.scale);

      const buttonScale = this.getScaledButtonPartScale();
      const sides = ['top', 'bottom', 'left', 'right'];
      for (const side of sides) {
        for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
          const partName = this.getButtonPartName(side, i);
          const buttonPart = aircraft.parts[partName];
          const buttonObj = buttonPart?.object3d;
          if (!buttonPart || !buttonObj) continue;

          buttonPart.position = this.scaleButtonLocalPosition(this.getButtonBasePosition(side, i));
          buttonPart.scale = [...buttonScale];
          buttonPart.originalScale = [...buttonPart.scale];
          buttonObj.setInitialPosition(buttonPart.position);
          buttonObj.setInitialScale(buttonPart.scale);
          buttonObj.setScale(buttonPart.scale);

          if (typeof aircraft.placePart === 'function') {
            aircraft.placePart(buttonPart);
          }
        }
      }
    }

    if ((changes.position || changes.rotation || changes.scale) && typeof aircraft.placePart === 'function') {
      aircraft.placePart(mfdPart);
    }

    return true;
  }

  installNodeClickHandler() {
    if (this.nodeClickHandlerInstalled) return false;

    window.controls.addNodeClickHandler(this.names.MFD_PART_NAME, this.onNodeClickBound);
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      window.controls.addNodeClickHandler(this.getTopButtonPartName(i), this.onNodeClickBound);
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      window.controls.addNodeClickHandler(this.getBottomButtonPartName(i), this.onNodeClickBound);
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      window.controls.addNodeClickHandler(this.getLeftButtonPartName(i), this.onNodeClickBound);
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      window.controls.addNodeClickHandler(this.getRightButtonPartName(i), this.onNodeClickBound);
    }
    this.nodeClickHandlerInstalled = true;
    return true;
  }

  removeNodeClickHandler() {
    if (!this.nodeClickHandlerInstalled) return;

    delete window.controls.nodeClickHandlers[this.names.MFD_PART_NAME];
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      delete window.controls.nodeClickHandlers[this.getTopButtonPartName(i)];
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      delete window.controls.nodeClickHandlers[this.getBottomButtonPartName(i)];
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      delete window.controls.nodeClickHandlers[this.getLeftButtonPartName(i)];
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      delete window.controls.nodeClickHandlers[this.getRightButtonPartName(i)];
    }
    this.nodeClickHandlerInstalled = false;
  }

  projectMfdCorner(cornerLocal, partObj, aircraftLla) {
    const partPos = partObj.worldPosition;
    const partRot = partObj.worldRotation;
    const sx = partObj._scale[0];
    const sy = partObj._scale[1];
    const sz = partObj._scale[2];

    const scaled = [cornerLocal[0] * sx, cornerLocal[1] * sy, cornerLocal[2] * sz];
    const rotated = M33.transform(partRot, scaled);
    const cornerWorld = [partPos[0] + rotated[0], partPos[1] + rotated[1], partPos[2] + rotated[2]];

    const delta = window.geofs.api.xyz2lla(cornerWorld, aircraftLla);
    const absLla = [aircraftLla[0] + delta[0], aircraftLla[1] + delta[1], aircraftLla[2] + delta[2]];

    return window.geofs.api.getScreenCoordFromLla(absLla);
  }

  getProjectedMfdBounds() {
    const aircraft = window.geofs.aircraft.instance;
    const partObj = aircraft.parts[this.names.MFD_PART_NAME]?.object3d;
    const aircraftLla = aircraft.llaLocation;
    if (!partObj || !aircraftLla) return null;

    const halfW = this.cfg.MFD_CLICK_HALF_WIDTH;
    const halfH = this.cfg.MFD_CLICK_HALF_HEIGHT;
    const localCorners = [
      [-halfW, 0,  halfH],
      [ halfW, 0,  halfH],
      [-halfW, 0, -halfH],
      [ halfW, 0, -halfH],
    ];

    const projected = localCorners.map(c => this.projectMfdCorner(c, partObj, aircraftLla));
    if (projected.some(p => !p)) return null;

    const [topLeft, topRight, bottomLeft, bottomRight] = projected;
    const xs = projected.map(p => p.x);
    const ys = projected.map(p => p.y);

    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      corners: { topLeft, topRight, bottomLeft, bottomRight }
    };
  }

  pointInTriangle(p, a, b, c) {
    const area = (u, v, w) => (u.x - w.x) * (v.y - w.y) - (v.x - w.x) * (u.y - w.y);
    const s1 = area(p, a, b);
    const s2 = area(p, b, c);
    const s3 = area(p, c, a);
    const hasNeg = s1 < 0 || s2 < 0 || s3 < 0;
    const hasPos = s1 > 0 || s2 > 0 || s3 > 0;
    return !(hasNeg && hasPos);
  }

  pointInProjectedQuad(x, y, corners) {
    const p = { x, y };
    const { topLeft, topRight, bottomLeft, bottomRight } = corners;
    return this.pointInTriangle(p, topLeft, topRight, bottomRight)
      || this.pointInTriangle(p, topLeft, bottomRight, bottomLeft);
  }

  getPickScore(x, y) {
    const bounds = this.getProjectedMfdBounds();
    if (!bounds || !this.pointInProjectedQuad(x, y, bounds.corners)) {
      return Infinity;
    }

    const { topLeft, topRight, bottomLeft, bottomRight } = bounds.corners;
    const centerX = (topLeft.x + topRight.x + bottomLeft.x + bottomRight.x) / 4;
    const centerY = (topLeft.y + topRight.y + bottomLeft.y + bottomRight.y) / 4;
    const dx = x - centerX;
    const dy = y - centerY;
    return dx * dx + dy * dy;
  }

  getButtonIndexFromScreenCoords(side, x, y) {
    const aircraft = window.geofs.aircraft.instance;
    const aircraftLla = aircraft.llaLocation;
    const halfW = this.cfg.MFD_CLICK_HALF_WIDTH * this.cfg.MFD_TOP_BUTTON_VISUAL_SCALE;
    const halfH = this.cfg.MFD_CLICK_HALF_HEIGHT * this.cfg.MFD_TOP_BUTTON_VISUAL_SCALE;
    const localCorners = [
      [-halfW, 0, halfH],
      [halfW, 0, halfH],
      [-halfW, 0, -halfH],
      [halfW, 0, -halfH]
    ];

    const count = this.cfg.MFD_BUTTON_COUNT;

    for (let i = 0; i < count; i++) {
      const partName = this.getButtonPartName(side, i);
      const partObj = aircraft.parts[partName]?.object3d;
      if (!partObj) continue;

      const projected = localCorners.map((corner) => this.projectMfdCorner(corner, partObj, aircraftLla));
      if (projected.some((p) => !p)) continue;

      const [topLeft, topRight, bottomLeft, bottomRight] = projected;
      const inside = this.pointInProjectedQuad(x, y, { topLeft, topRight, bottomLeft, bottomRight });
      if (inside) {
        return i;
      }
    }

    return -1;
  }

  isOwnedNode(nodeName) {
    if (nodeName === this.names.MFD_PART_NAME) return true;
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      if (nodeName === this.getTopButtonPartName(i)) return true;
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      if (nodeName === this.getBottomButtonPartName(i)) return true;
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      if (nodeName === this.getLeftButtonPartName(i)) return true;
    }
    for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
      if (nodeName === this.getRightButtonPartName(i)) return true;
    }
    return false;
  }

  onNodeClick(nodeName) {
    if (window.geofs.camera.currentModeName !== 'cockpit') {
      return false;
    }

    if (!this.isOwnedNode(nodeName)) {
      return false;
    }

    const topButtonIndex = (() => {
      for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
        if (nodeName === this.getTopButtonPartName(i)) return i;
      }
      return -1;
    })();

    if (topButtonIndex >= 0) {
      this.uiState.setPage(topButtonIndex);
      return true;
    }

    const bottomButtonIndex = (() => {
      for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
        if (nodeName === this.getBottomButtonPartName(i)) return i;
      }
      return -1;
    })();

    if (bottomButtonIndex >= 0) {
      this.uiState.setPage(this.cfg.MFD_BUTTON_COUNT + bottomButtonIndex);
      return true;
    }

    const leftButtonIndex = (() => {
      for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
        if (nodeName === this.getLeftButtonPartName(i)) return i;
      }
      return -1;
    })();

    if (leftButtonIndex >= 0) {
      this.uiState.toggleButtonBySlot('left', leftButtonIndex);
      return true;
    }

    const rightButtonIndex = (() => {
      for (let i = 0; i < this.cfg.MFD_BUTTON_COUNT; i++) {
        if (nodeName === this.getRightButtonPartName(i)) return i;
      }
      return -1;
    })();

    if (rightButtonIndex >= 0) {
      this.uiState.toggleButtonBySlot('right', rightButtonIndex);
      return true;
    }

    if (nodeName === this.names.MFD_PART_NAME) {
      return this.handlePickClick();
    }

    return false;
  }

  handlePickClick(clickOverride = null) {
    const click = clickOverride ?? HelperModule.getClickScreenCoords();
    if (!click) return false;

    const bounds = this.getProjectedMfdBounds();
    if (!bounds || !this.pointInProjectedQuad(click.x, click.y, bounds.corners)) {
      return false;
    }

    const pickedTopButtonIndex = this.getButtonIndexFromScreenCoords('top', click.x, click.y);
    if (pickedTopButtonIndex >= 0) {
      this.uiState.setPage(pickedTopButtonIndex);
      return true;
    }

    const pickedBottomButtonIndex = this.getButtonIndexFromScreenCoords('bottom', click.x, click.y);
    if (pickedBottomButtonIndex >= 0) {
      this.uiState.setPage(this.cfg.MFD_BUTTON_COUNT + pickedBottomButtonIndex);
      return true;
    }

    const pickedLeftButtonIndex = this.getButtonIndexFromScreenCoords('left', click.x, click.y);
    if (pickedLeftButtonIndex >= 0) {
      this.uiState.toggleButtonBySlot('left', pickedLeftButtonIndex);
      return true;
    }

    const pickedRightButtonIndex = this.getButtonIndexFromScreenCoords('right', click.x, click.y);
    if (pickedRightButtonIndex >= 0) {
      this.uiState.toggleButtonBySlot('right', pickedRightButtonIndex);
      return true;
    }

    this.uiState.nextPage();
    return true;
  }

  restore() {
    this.removeNodeClickHandler();
    this.removeParts();
    this.defaultPageApplied = false;
  }
}

// MfdModule - Per-aircraft MFD module (page registry + display management)
class MfdModule {
  constructor(helperModule, mapModule, cameraModule, weaponsModule, recorderModule) {
    this.helperModule = helperModule;
    this.mapModule = mapModule;
    this.cameraModule = cameraModule;
    this.weaponsModule = weaponsModule;
    this.recorderModule = recorderModule;
    this.mfds = [];
    this.pageRegistry = [];
    this.mfdPickNodeHandlerInstalled = false;
    this.onMfdPickNodeClickBound = this.onMfdPickNodeClick.bind(this);
    this.runNodeBridgeInstalled = false;
    this.cameraWatchTimer = null;
    this.cameraWatchTicks = 0;
    this.lastMfdRecoveryTick = -999;
  }

  static getMfdBrightnessFactor() {
    const brightMode = OptionModule.getOption('HUD', 'BRIGHT', 'NORM');
    if (brightMode === 'DAY') return 1.0;
    if (brightMode === 'NIGHT') return 0.3;
    return 0.6;
  }

  static applyBrightnessToHexColor(color, factor) {
    const hex = color.startsWith('#') ? color.slice(1) : color;
    const clampChannel = (channel) => Math.max(0, Math.min(255, Math.round(channel * factor)));
    const r = clampChannel(parseInt(hex.slice(0, 2), 16));
    const g = clampChannel(parseInt(hex.slice(2, 4), 16));
    const b = clampChannel(parseInt(hex.slice(4, 6), 16));
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  getDefaultParentPartName() {
    const parts = window.geofs?.aircraft?.instance?.parts;
    if (parts?.cockpit) return 'cockpit';

    const hudPart = Object.values(parts || {})
      .find((part) => part.renderer?.name === 'genericHUD' || part.rendererInstance?.definition?.name === 'genericHUD');
    return hudPart?.parent || 'root';
  }

  registerPage(pageDefinition) {
    if (!pageDefinition.title) return false;
    
    const existingIndex = this.pageRegistry.findIndex(p => p.title === pageDefinition.title);
    if (existingIndex >= 0) {
      this.pageRegistry[existingIndex] = pageDefinition;
    } else {
      this.pageRegistry.push(pageDefinition);
    }
    return true;
  }

  addMfd(config = {}) {
    const display = new MfdDisplay(this, config);
    this.mfds.push(display);
    return display;
  }

  getMfdAtScreenPoint(x, y) {
    let targetDisplay = null;
    let bestScore = Infinity;

    for (const display of this.mfds) {
      const score = display.getPickScore(x, y);
      if (score < bestScore) {
        bestScore = score;
        targetDisplay = display;
      }
    }

    return Number.isFinite(bestScore) ? targetDisplay : null;
  }

  onMfdPickNodeClick(nodeName) {
    if (nodeName !== 'glassPanel') {
      for (const display of this.mfds) {
        if (display.onNodeClick(nodeName)) return;
      }
      return;
    }

    const click = this.helperModule.getClickScreenCoords();
    if (!click) return;

    const targetDisplay = this.getMfdAtScreenPoint(click.x, click.y);
    targetDisplay?.handlePickClick(click);
  }

  ensureGlobalMfdPickNodeHandler() {
    if (!window.controls?.addNodeClickHandler) return false;
    window.controls.addNodeClickHandler('glassPanel', this.onMfdPickNodeClickBound);
    this.mfdPickNodeHandlerInstalled = true;
    return true;
  }

  ensureRunNodeClickBridge() {
    if (this.runNodeBridgeInstalled) return true;

    let handler = window.controls.runNodeClickHandlers;
    if (!handler.__mfdBridge) {
      const original = handler.bind(window.controls);
      const bridgedHandler = (nodeName) => {
        bridgedHandler.__mfdBridgeOriginal(nodeName);
        if (window.controls.nodeClickHandlers[nodeName]) return;
        for (const callback of bridgedHandler.__mfdBridgeCallbacks) {
          callback(nodeName);
        }
      };

      bridgedHandler.__mfdBridge = true;
      bridgedHandler.__mfdBridgeOriginal = original;
      bridgedHandler.__mfdBridgeCallbacks = [];
      window.controls.runNodeClickHandlers = bridgedHandler;
      handler = bridgedHandler;
    }

    if (!handler.__mfdBridgeCallbacks.includes(this.onMfdPickNodeClickBound)) {
      handler.__mfdBridgeCallbacks.push(this.onMfdPickNodeClickBound);
    }

    this.runNodeBridgeInstalled = true;
    return true;
  }

  removeGlobalMfdPickNodeHandler() {
    if (!this.mfdPickNodeHandlerInstalled) return;
    delete window.controls.nodeClickHandlers.glassPanel;
    this.mfdPickNodeHandlerInstalled = false;
  }

  removeRunNodeClickBridge() {
    if (!this.runNodeBridgeInstalled) return;

    const handler = window.controls.runNodeClickHandlers;
    if (handler.__mfdBridge) {
      handler.__mfdBridgeCallbacks = handler.__mfdBridgeCallbacks.filter((callback) => callback !== this.onMfdPickNodeClickBound);
      if (!handler.__mfdBridgeCallbacks.length) {
        window.controls.runNodeClickHandlers = handler.__mfdBridgeOriginal;
      }
    }

    this.runNodeBridgeInstalled = false;
  }

  startCameraWatch() {
    if (this.cameraWatchTimer) return;

    this.cameraWatchTimer = setInterval(() => {
      this.cameraWatchTicks += 1;
      const mode = window.geofs.camera.currentModeName;
      const aircraft = window.geofs.aircraft.instance;
      if (!aircraft || !aircraft.parts) return;

      if (mode !== 'cockpit') return;
      if ((this.cameraWatchTicks % 4) !== 0) return;

      for (const display of this.mfds) {
        display.ensureLoaded();
      }
    }, 250);
  }

  stopCameraWatch() {
    if (!this.cameraWatchTimer) return;
    clearInterval(this.cameraWatchTimer);
    this.cameraWatchTimer = null;
  }

  initializeDefaultMfds(defaultLayout) {
    const existingSlots = new Set(this.mfds.map((display) => display.slotName));
    for (const config of defaultLayout) {
      if (existingSlots.has(config.name)) continue;
      this.addMfd(config);
      existingSlots.add(config.name);
    }
  }

  getSlots() {
    return this.mfds.map((display) => display.slotName);
  }

  getDisplay(slotName = 'RIGHT') {
    return this.mfds.find((display) => display.slotName === slotName) || null;
  }

  getDisplayTransform(slotName = 'RIGHT') {
    const display = this.getDisplay(slotName);
    if (!display) return null;

    return {
      slotName: display.slotName,
      position: [...display.cfg.position],
      rotation: [...display.cfg.rotation],
      scale: [...display.cfg.scale]
    };
  }

  static vec3Equals(a, b) {
    return Array.isArray(a)
      && Array.isArray(b)
      && a.length >= 3
      && b.length >= 3
      && a[0] === b[0]
      && a[1] === b[1]
      && a[2] === b[2];
  }

  updateDisplayTransform(slotName = 'RIGHT', transform = {}, options = {}) {
    const display = this.getDisplay(slotName);
    if (!display) return false;

    const applyScale = options.applyScale === true;
    const changes = {
      position: false,
      rotation: false,
      scale: false
    };

    if (transform.position) {
      const nextPosition = [...transform.position];
      changes.position = !MfdModule.vec3Equals(display.cfg.position, nextPosition);
      if (changes.position) {
        display.cfg.position = nextPosition;
      }
    }
    if (transform.rotation) {
      const nextRotation = [...transform.rotation];
      changes.rotation = !MfdModule.vec3Equals(display.cfg.rotation, nextRotation);
      if (changes.rotation) {
        display.cfg.rotation = nextRotation;
      }
    }
    if (transform.scale && applyScale) {
      const nextScale = [...transform.scale];
      changes.scale = !MfdModule.vec3Equals(display.cfg.scale, nextScale);
      if (changes.scale) {
        display.cfg.scale = nextScale;
      }
    }

    if (!changes.position && !changes.rotation && !changes.scale) return true;

    if (!display.applyTransformToLiveParts(changes)) {
      display.restore();
      display.ensureLoaded();
    }
    return true;
  }

  ensureLoaded() {
    const pickNodeReady = this.ensureGlobalMfdPickNodeHandler();
    const nodeBridgeReady = this.ensureRunNodeClickBridge();
    
    this.mfds.forEach((display) => {
      display.ensureLoaded();
    });
    
    return pickNodeReady && nodeBridgeReady;
  }

  restore() {
    this.stopCameraWatch();
    this.removeGlobalMfdPickNodeHandler();
    this.removeRunNodeClickBridge();
    this.mfds.forEach((display) => display.restore());
  }
}
