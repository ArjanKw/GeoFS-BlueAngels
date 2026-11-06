
  class CameraModule {
    static DEFAULT_HUD_CAMERA_Z = 0.95;
    static CAMERA_STEP_Z = 0.005;
    static CAMERA_UP_BUTTON_ID = 'f18-hud-camera-up';
    static CAMERA_DOWN_BUTTON_ID = 'f18-hud-camera-down';
    static CAMERA_VIEW_BUTTON_ID = 'f18-cockpit-view-cycle';

    constructor(helperModule, config = {}) {
      this.helperModule = helperModule;
      this.config = (config && typeof config === 'object') ? config : {};
      this.installed = false;
      this.originalModesByIndex = new Map();
      this.boundModesRef = null;
      this.cockpitViewIndex = 0;
      this.cockpitViewControlsWrapperId = 'f18-cockpit-view-controls';
      this.cockpitViewApplied = false;
    }

    getCockpitViewPresets() {
      const presets = this.config?.cockpitViewPresets;
      return Array.isArray(presets) ? presets : [];
    }

    getCameraModeDefinitions() {
      const defs = this.config?.cameraModeDefinitions;
      return (defs && typeof defs === 'object') ? defs : {};
    }

    createCameraPadButton(label, id, onClick) {
      const outerStyle = {};
      if (label === 'UP') {
        outerStyle.borderBottom = '1px solid #333';
        outerStyle.borderRadius = '15px 15px 0 0';
      } else if (label === 'DOWN') {
        outerStyle.marginTop = '-9px';
        outerStyle.borderRadius = '0 0 15px 15px';
        outerStyle.borderTop = '0';
      }

      return this.helperModule?.createPadButton({
        label,
        id,
        onClick,
        outerStyle
      }) ?? null;
    }

    adjustHudCameraZ(delta) {
      const mode = window.geofs?.camera?.modes?.[1];
      if (!mode?.position) return false;
      
      const currentZ = mode.position[2] ?? CameraModule.DEFAULT_HUD_CAMERA_Z;
      const newZ = currentZ + delta;
      mode.position[2] = newZ;
      
      if (mode.offsets?.current) {
        mode.offsets.current[2] = 0;
      }
      
      return true;
    }

    installCameraControls() {
      if (document.getElementById('f18-hud-camera-controls')) return true;
      if (!this.helperModule) return false;

      const wrapper = document.createElement('div');
      wrapper.id = 'f18-hud-camera-controls';
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '4px';
      wrapper.style.alignItems = 'flex-start';

      const self = this;
      const upButton = this.createCameraPadButton('UP', CameraModule.CAMERA_UP_BUTTON_ID, () => {
        self.adjustHudCameraZ(CameraModule.CAMERA_STEP_Z);
      });
      const seatLabelButton = this.helperModule?.createPadButton({
        label: 'SEAT',
        id: 'f18-seat-label',
        onClick: () => {},
        outerStyle: {
          marginTop: '-9px',
          borderRadius: '0',
          borderTop: '0',
          cursor: 'default',
          pointerEvents: 'none'
        },
        innerStyle: {
          fontWeight: '700'
        }
      });
      const downButton = this.createCameraPadButton('DOWN', CameraModule.CAMERA_DOWN_BUTTON_ID, () => {
        self.adjustHudCameraZ(-CameraModule.CAMERA_STEP_Z);
      });

      if (!upButton || !seatLabelButton || !downButton) return false;

      wrapper.appendChild(upButton);
      wrapper.appendChild(seatLabelButton);
      wrapper.appendChild(downButton);
      return this.helperModule.installPadControl({
        id: wrapper.id,
        element: wrapper,
        prepend: true
      });
    }

    installCockpitViewControls() {
      if (document.getElementById(this.cockpitViewControlsWrapperId)) return true;
      if (!this.helperModule) return false;

      const wrapper = document.createElement('div');
      wrapper.id = this.cockpitViewControlsWrapperId;
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '0px';
      wrapper.style.alignItems = 'flex-start';

      const viewButton = this.helperModule?.createPadButton({
        label: 'VIEW',
        id: CameraModule.CAMERA_VIEW_BUTTON_ID,
        onClick: () => {
          this.nextCockpitView();
        },
        outerStyle: {
          borderRadius: '15px'
        },
        innerStyle: {
          fontWeight: '700'
        }
      });

      if (!viewButton) return false;
      wrapper.appendChild(viewButton);

      return this.helperModule.installPadControl({
        id: wrapper.id,
        element: wrapper,
        prepend: true
      });
    }

    removeCameraControls() {
      this.helperModule?.removePadControl('f18-hud-camera-controls');
    }

    removeCockpitViewControls() {
      this.helperModule?.removePadControl(this.cockpitViewControlsWrapperId);
    }

    applyCockpitViewByIndex(index = 0) {
      const mode = window.geofs?.camera?.modes?.[1];
      if (!mode) return false;

      const views = this.getCockpitViewPresets();
      if (!views.length) return false;
      const safeIndex = HelperModule.clampValue(Math.floor(Number(index) || 0), 0, views.length - 1);
      const preset = views[safeIndex];
      if (!preset) return false;

      mode.position = Array.isArray(preset.position) ? [...preset.position] : [0, 5.5, CameraModule.DEFAULT_HUD_CAMERA_Z];
      mode.offsets = mode.offsets && typeof mode.offsets === 'object' ? mode.offsets : {};
      mode.offsets.current = [0, 0, 0];
      mode.orientations = mode.orientations && typeof mode.orientations === 'object' ? mode.orientations : {};
      mode.orientations.current = Array.isArray(preset.orientation) ? [...preset.orientation] : [0, -15, 0];
      mode.orientation = Array.isArray(preset.orientation) ? [...preset.orientation] : [0, -15, 0];
      mode.FOV = Number.isFinite(Number(preset.FOV)) ? Number(preset.FOV) : 1.7;

      this.cockpitViewIndex = safeIndex;
      return true;
    }

    nextCockpitView() {
      const views = this.getCockpitViewPresets();
      if (!views.length) return false;
      const next = (this.cockpitViewIndex + 1) % views.length;
      const ok = this.applyCockpitViewByIndex(next);
      if (ok) this.cockpitViewApplied = true;
      return ok;
    }

    isAircraftCameraReady() {
      const aircraft = window.geofs?.aircraft?.instance;
      const parts = aircraft?.parts;
      const mode1 = window.geofs?.camera?.modes?.[1];
      return Boolean(parts && Object.keys(parts).length > 0 && mode1?.position);
    }

    hasCustomModes(modes) {
      if (!modes) return false;
      const definitions = this.getCameraModeDefinitions();
      return Object.entries(definitions).every(([indexKey, definition]) => {
        const index = Number(indexKey);
        const current = modes[index];
        return Boolean(current && current.name === definition.name && current.view === definition.view);
      });
    }

    ensureLoaded() {
      if (!window.BasePlugin?.getActivePlugin?.()?.isAircraftActive?.()) {
        this.removeCameraControls();
        this.removeCockpitViewControls();
        return false;
      }

      const modes = window.geofs?.camera?.modes;
      if (!modes) return false;
      if (!this.isAircraftCameraReady()) {
        return false;
      }

      const cockpitViewPresets = this.getCockpitViewPresets();
      const cameraModeDefinitions = this.getCameraModeDefinitions();

      const isCockpitView = window.geofs?.camera?.currentModeName === 'cockpit';
      if (cockpitViewPresets.length > 0) {
        if (!this.installCockpitViewControls()) return false;
      } else {
        this.removeCockpitViewControls();
      }
      if (isCockpitView) {
        if (!this.installCameraControls()) return false;
      } else {
        this.removeCameraControls();
        this.removeCockpitViewControls();
        this.cockpitViewApplied = false;
      }

      const modesRefChanged = this.boundModesRef && this.boundModesRef !== modes;
      const customModesPresent = this.hasCustomModes(modes);

      if (this.installed && !modesRefChanged && customModesPresent) {
        return true;
      }

      if (!this.installed || modesRefChanged) {
        this.originalModesByIndex.clear();
      }

      for (const [indexKey, definition] of Object.entries(cameraModeDefinitions)) {
        const index = Number(indexKey);
        if (!Number.isInteger(index)) continue;

        if (!this.originalModesByIndex.has(index)) {
          const hasOriginalMode = Object.prototype.hasOwnProperty.call(modes, index);
          this.originalModesByIndex.set(index, {
            exists: hasOriginalMode,
            value: hasOriginalMode ? HelperModule.deepCloneJson(modes[index]) : null
          });
        }

        modes[index] = HelperModule.deepCloneJson(definition);
      }

      this.installed = true;
      this.boundModesRef = modes;

      if (isCockpitView && cockpitViewPresets.length > 0 && (!this.cockpitViewApplied || modesRefChanged || !customModesPresent)) {
        this.applyCockpitViewByIndex(this.cockpitViewIndex);
        this.cockpitViewApplied = true;
      }
      return true;
    }

    restore() {
      this.removeCameraControls();
      this.removeCockpitViewControls();

      if (!this.installed && this.originalModesByIndex.size === 0) return;

      const modes = window.geofs?.camera?.modes;
      if (modes && (!this.boundModesRef || modes === this.boundModesRef)) {
        for (const [index, originalState] of this.originalModesByIndex.entries()) {
          if (originalState?.exists) {
            modes[index] = HelperModule.deepCloneJson(originalState.value);
          } else {
            delete modes[index];
          }
        }
      }

      this.originalModesByIndex.clear();
      this.installed = false;
      this.boundModesRef = null;
      this.cockpitViewApplied = false;
    }
  }