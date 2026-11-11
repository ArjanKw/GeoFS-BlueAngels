
class WeaponModule {
    constructor(config = {}) {
        this.STORAGE_KEY = config.storageKey ?? 'DefaultWpnState';
        this.LOADOUT_BY_CONFIG = config.loadouts ?? {};
        
        this.STATION_RENDER_ORDER = [
            { side: 'center', station: 'gun' },
            { side: 'left', station: 'wingtip' },
            { side: 'left', station: 'hardpoint1' },
            { side: 'left', station: 'hardpoint2' },
            { side: 'right', station: 'hardpoint2' },
            { side: 'right', station: 'hardpoint1' },
            { side: 'right', station: 'wingtip' }
        ];

        this.FIRE_BLINK_INTERVAL_MS = 500;
        this.FIRE_BLINK_PHASES = 4;
        this.GUN_FIRE_RATE_RPS = 100;
        this.GUN_ROUNDS_PER_BURST = 100;
        this.GUN_FIRE_TICK_MS = 16;
        this.REARM_DURATION_MS = 60_000;

        this.selectedWeaponByMode = {};
        this.loadoutTemplates = JSON.parse(JSON.stringify(this.LOADOUT_BY_CONFIG));
        this.currentLoadout = JSON.parse(JSON.stringify(
            this.loadoutTemplates['A/A']
            ?? Object.values(this.loadoutTemplates)[0]
            ?? {}
        ));
        this.rearmState = {
            active: false,
            startTime: 0,
            progress: 0,
            durationMs: this.REARM_DURATION_MS,
            config: 'A/A',
            status: 'IDLE',
            lastSavedPercent: -1
        };
        this.gunFireState = {
            timerId: null,
            mode: null,
            roundsRemainingInBurst: 0,
            triggerHeld: false,
            firing: false,
            lastTickAt: 0,
            accumulator: 0
        };
        this.fireFlash = {
            startTime: 0,
            label: 'FIRE'
        };
        this.listeners = new Map();

        this.loadStateFromStorage();
    }

    static effectivenessByType = 
    [
        {
            "name": "AIM-9X",
            "engagement_window": { "min": 0.2, "max": 18.9 },
            "effective_range": { "min": 0.5, "max": 8.1 }
        },
        {
            "name": "AIM-120C",
            "engagement_window": { "min": 1.1, "max": 48.6 },
            "effective_range": { "min": 10.8, "max": 27.0 }
        },
        {
            "name": "AIM-120D",
            "engagement_window": { "min": 1.1, "max": 86.4 },
            "effective_range": { "min": 16.2, "max": 43.2 }
        },
        {
            "name": "AIM-7M",
            "engagement_window": { "min": 1.1, "max": 37.8 },
            "effective_range": { "min": 8.1, "max": 21.6 }
        },
        {
            "name": "R-73",
            "engagement_window": { "min": 0.2, "max": 21.6 },
            "effective_range": { "min": 0.5, "max": 8.1 }
        },
        {
            "name": "R-27R",
            "engagement_window": { "min": 1.1, "max": 40.5 },
            "effective_range": { "min": 10.8, "max": 24.3 }
        },
        {
            "name": "R-27ER",
            "engagement_window": { "min": 1.1, "max": 70.2 },
            "effective_range": { "min": 16.2, "max": 37.8 }
        },
        {
            "name": "R-27T",
            "engagement_window": { "min": 0.5, "max": 21.6 },
            "effective_range": { "min": 5.4, "max": 16.2 }
        },
        {
            "name": "R-27ET",
            "engagement_window": { "min": 0.5, "max": 64.8 },
            "effective_range": { "min": 10.8, "max": 32.4 }
        },
        {
            "name": "R-77",
            "engagement_window": { "min": 1.1, "max": 43.2 },
            "effective_range": { "min": 10.8, "max": 27.0 }
        },
        {
            "name": "R-77-1",
            "engagement_window": { "min": 1.1, "max": 59.4 },
            "effective_range": { "min": 16.2, "max": 37.8 }
        },
        {
            "name": "R-77M",
            "engagement_window": { "min": 1.6, "max": 102.6 },
            "effective_range": { "min": 21.6, "max": 54.0 }
        }
    ];

    // Shared projectile characteristics taken from the former EEGS script.
    // Aircraft loadouts select a weapon name; they do not redefine its physics.
    static projectileMetadataByType = {
        'AIM-9X': { speed: 850, turnRate: 1.2, maxFlightTime: 30 },
        'AIM-120C': { speed: 900, turnRate: 1.2, maxFlightTime: 45 },
        'AIM-120D': { speed: 900, turnRate: 1.2, maxFlightTime: 60 },
        'AIM-7M': { speed: 850, turnRate: 1.0, maxFlightTime: 45 },
        'R-73': { speed: 850, turnRate: 1.2, maxFlightTime: 30 },
        'R-27R': { speed: 900, turnRate: 1.1, maxFlightTime: 45 },
        'R-27ER': { speed: 950, turnRate: 1.1, maxFlightTime: 55 },
        'R-27T': { speed: 850, turnRate: 1.1, maxFlightTime: 35 },
        'R-27ET': { speed: 900, turnRate: 1.1, maxFlightTime: 50 },
        'R-77': { speed: 900, turnRate: 1.2, maxFlightTime: 45 },
        'R-77-1': { speed: 950, turnRate: 1.2, maxFlightTime: 50 },
        'R-77M': { speed: 1000, turnRate: 1.3, maxFlightTime: 60 }
    };

    // Gun and missile launch constants taken from the former EEGS script.
    static gunMetadata = {
        muzzleVelocity: 1050,
        drag: 0.4,
        gravity: 9.81,
        tracerEvery: 5,
        tracerMinDist: 25,
        tracerColor: '#eb9800',
        impactColor: '#707070'
    };

    static defaultMissileMetadata = { speed: 900, turnRate: 1.2, maxFlightTime: 45, launchSpeed: 850 };

    registerMfdPages(mfdModule) {
        mfdModule.registerPage({
        title: 'WPN',
        leftButtons: [
            { key: 'MASTER', label: 'MSTR', states: ['OFF', 'ON', 'SIM'], stateIndex: 0 },
            {
            key: 'SELECT',
            label: 'SEL',
            states: ['NEXT'],
            stateIndex: 0,
            onClick: ({ page }) => {
                const mode = OptionModule.getOption('WPN', 'MODE', 'NAV');
                const modeLoadout = this.getModeLoadout(mode);
                this.selectNextWeapon(mode, modeLoadout, 0);
            },
            show: () => window.controls?.gear?.position === 1 && window.geofs?.animation?.values?.haglFeet > 50
            },
            {
            key: 'CONFIG',
            label: 'CFG',
            states: ['A/A', 'L/R A/A', 'A/G', 'L/R A/G', 'L/R', 'MIN', 'CLEAN'],
            stateIndex: 0,
            show: () => HelperModule.isAircraftParkedAndCold()
            }

        ],
        rightButtons: [
            { key: 'MODE', label: 'MODE', states: ['NAV', 'A/A', 'A/G', 'JETTISON'], stateIndex: 0 },
            {
            key: 'FIRE',
            label: 'FIRE',
            states: ['N/A'],
            stateIndex: 0,
            onClick: ({ page }) => {
                const mode = OptionModule.getOption('WPN', 'MODE', 'NAV');
                const modeLoadout = this.getModeLoadout(mode);
                this.fireSelectedWeapon(mode, modeLoadout);
            },
            show: () => window.controls?.gear?.position === 1 && window.geofs?.animation?.values?.haglFeet > 50 && OptionModule.getOption('WPN', 'MASTER', 'OFF') !== 'OFF' && OptionModule.getOption('WPN', 'MODE', 'NAV') !== 'JETTISON'
            },
            {
            key: 'JETTISON',
            label: 'JETT',
            states: ['N/A'],
            stateIndex: 0,
            onClick: ({ page }) => {
                const mode = OptionModule.getOption('WPN', 'MODE', 'NAV');
                const modeLoadout = this.getModeLoadout(mode);
                this.jettisonSelectedWeapon(mode, modeLoadout);
            },
            show: () => window.controls?.gear?.position === 1 && window.geofs?.animation?.values?.haglFeet > 50 && OptionModule.getOption('WPN', 'MODE', 'NAV') === 'JETTISON'
            },
            {
            key: 'REARM',
            label: 'ARM',
            states: ['START'],
            stateIndex: 0,
            onClick: ({ page }) => {
                const config = OptionModule.getOption('WPN', 'CONFIG', 'A/A');
                this.startRearm(config);
            },
            show: () => HelperModule.isAircraftParkedAndCold() && OptionModule.getOption('WPN', 'MASTER', 'OFF') === 'OFF'
            }
        ],
        lines: [],
        render: (renderer, renderContext) => {
            const ctx = renderContext?.ctx ?? renderer?.canvasAPI?.context;
            const w = renderContext?.w ?? renderer?.canvasAPI?.canvas?.width ?? 512;
            const h = renderContext?.h ?? renderer?.canvasAPI?.canvas?.height ?? 512;
            if (!ctx) return;

            this.updateRearmState();

            const selectedMode = OptionModule.getOption('WPN', 'MODE', 'NAV');
            const modeLoadout = this.getModeLoadout(selectedMode);
            if (!modeLoadout) return;
            const selectedWeapon = this.ensureSelectedWeapon(selectedMode, modeLoadout);

            const fireButton = renderContext?.page?.rightButtons?.find((b) => b?.key === 'FIRE');
            if (fireButton) {
            fireButton.states = [this.getSelectedLoadDisplay(selectedMode, modeLoadout)];
            fireButton.stateIndex = 0;
            }
            const jettisonButton = renderContext?.page?.rightButtons?.find((b) => b?.key === 'JETTISON');
            if (jettisonButton) {
            jettisonButton.states = [this.getSelectedLoadDisplay(selectedMode, modeLoadout)];
            jettisonButton.stateIndex = 0;
            }

            const color = renderContext?.color ?? '#00ff66';
            const left = modeLoadout?.left ?? {};
            const right = modeLoadout?.right ?? {};
            const gunRounds = Number.isFinite(modeLoadout?.gun) ? modeLoadout.gun : '--';

            const drawDiamond = (x, y, size) => {
            ctx.beginPath();
            ctx.moveTo(x, y - size);
            ctx.lineTo(x + size, y);
            ctx.lineTo(x, y + size);
            ctx.lineTo(x - size, y);
            ctx.closePath();
            ctx.stroke();
            };

            const drawStation = (x, y, station, options = {}) => {
            const quantity = Number.isFinite(station?.quantity) ? String(station.quantity) : '--';
            const display = station?.display ?? '--';
            const showDiamond = options.showDiamond !== false;
            const boxedQuantity = options.boxedQuantity === true;

            if (showDiamond) {
                drawDiamond(x, y - h * 0.036, w * 0.012);
            }

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${Math.round(h * 0.042)}px monospace`;

            if (boxedQuantity) {
                const boxW = w * 0.078;
                const boxH = h * 0.044;
                const by = y - boxH * 0.5 + h * 0.003;
                ctx.strokeRect(x - boxW * 0.5, by + 1, boxW, boxH);
            }

            ctx.fillText(quantity, x, y + 4);
            ctx.fillText(display, x, y + h * 0.045 + 4);
            };

            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = Math.max(1.4, w * 0.003);

            const yOffset = h * 0.11;
            const cx = w * 0.5;

            const leftRootX = w * 0.44;
            const rightRootX = w * 0.56;
            const topY = h * 0.20 + yOffset;
            const midY = h * 0.31 + yOffset;
            const breakY = h * 0.40 + yOffset;
            const tipY = h * 0.54 + yOffset;
            const leftBreakX = w * 0.31;
            const rightBreakX = w * 0.69;
            const leftTipX = w * 0.09;
            const rightTipX = w * 0.91;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${Math.round(h * 0.048)}px monospace`;

            if (selectedWeapon?.station === 'gun') {
            const boxW = w * 0.12;
            const boxH = h * 0.06;
            ctx.strokeRect(cx - boxW * 0.5, topY - boxH * 0.5, boxW, boxH);
            }

            ctx.fillText(String(gunRounds), cx, topY);
            ctx.beginPath();
            ctx.moveTo(leftRootX, topY);
            ctx.lineTo(leftRootX, midY);
            ctx.lineTo(leftBreakX, breakY);
            ctx.lineTo(leftTipX, tipY);
            ctx.moveTo(rightRootX, topY);
            ctx.lineTo(rightRootX, midY);
            ctx.lineTo(rightBreakX, breakY);
            ctx.lineTo(rightTipX, tipY);
            ctx.stroke();

            ctx.font = `bold ${Math.round(h * 0.055)}px monospace`;
            ctx.fillText('FUEL', cx, h * 0.35 + yOffset);

            if (OptionModule.getOption('WPN', 'MASTER', 'OFF') !== 'OFF') {
            ctx.fillText('ARM', cx, h * 0.47 + yOffset);
            }

            ctx.font = `bold ${Math.round(h * 0.046)}px monospace`;
            drawStation(w * 0.06, h * 0.50 + yOffset, left?.wingtip, {
            showDiamond: false,
            boxedQuantity: selectedWeapon?.side === 'left' && selectedWeapon?.station === 'wingtip'
            });
            drawStation(w * 0.18, h * 0.54 + yOffset, left?.hardpoint1, {
            boxedQuantity: selectedWeapon?.side === 'left' && selectedWeapon?.station === 'hardpoint1'
            });
            drawStation(w * 0.29, h * 0.47 + yOffset, left?.hardpoint2, {
            boxedQuantity: selectedWeapon?.side === 'left' && selectedWeapon?.station === 'hardpoint2'
            });

            drawStation(w * 0.71, h * 0.47 + yOffset, right?.hardpoint2, {
            boxedQuantity: selectedWeapon?.side === 'right' && selectedWeapon?.station === 'hardpoint2'
            });
            drawStation(w * 0.82, h * 0.54 + yOffset, right?.hardpoint1, {
            boxedQuantity: selectedWeapon?.side === 'right' && selectedWeapon?.station === 'hardpoint1'
            });
            drawStation(w * 0.94, h * 0.50 + yOffset, right?.wingtip, {
            showDiamond: false,
            boxedQuantity: selectedWeapon?.side === 'right' && selectedWeapon?.station === 'wingtip'
            });

            if (this.isFireFlashVisible()) {
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${Math.round(h * 0.12)}px monospace`;
            ctx.fillStyle = '#ff0000';
            ctx.fillText(this.getActionFlashLabel(), cx, h * 0.72);
            ctx.fillStyle = color;
            }

            const rearmTextY = h * 0.84;
            ctx.textBaseline = 'middle';

            const wpnRearmState = this.rearmState;
            if (wpnRearmState.active) {
                const progress = Math.max(0, Math.min(1, wpnRearmState.progress ?? 0));
                const pct = Math.round(progress * 100);
                const barW = w * 0.50;
                const barH = h * 0.03;
                const barX = cx - barW * 0.5;
                const barY = h * 0.875;

                ctx.font = `bold ${Math.round(h * 0.034)}px monospace`;
                ctx.fillText(`REARMING ${wpnRearmState.config} ${pct}%`, cx, rearmTextY);

                ctx.strokeRect(barX, barY, barW, barH);
                ctx.fillRect(barX, barY, barW * progress, barH);
            } else {
                ctx.font = `bold ${Math.round(h * 0.03)}px monospace`;
                ctx.fillText('Rearm with Engine OFF, Master OFF on ground.', cx, rearmTextY);
            }

            ctx.restore();
        }
        });
        return true;
    }

    isModeCompatibleStation(mode, stationName, stationData) {
        if (mode === 'JETTISON') return stationName !== 'gun';
        if (stationName === 'gun') return mode !== 'NAV';
        if (mode === 'NAV') return false;
        const stationType = stationData.type;
        if (!stationType) return true;
        return stationType === mode;
    }

    saveStateToStorage() {
        const payload = {
            config: OptionModule.getOption('WPN', 'CONFIG', 'A/A'),
            loadout: this.currentLoadout,
            selected: this.selectedWeaponByMode
        };
        window.localStorage.setItem(this.STORAGE_KEY, JSON.stringify(payload));
    }

    loadStateFromStorage() {
        const raw = window.localStorage.getItem(this.STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw);
        const storedLoadout = parsed.loadout;
        const baseTemplate = HelperModule.deepCloneJson(this.loadoutTemplates['A/A']);

        baseTemplate.gun = storedLoadout.gun;
        for (const sideKey of ['left', 'right']) {
            for (const stationKey of Object.keys(baseTemplate[sideKey])) {
                const stationTemplate = baseTemplate[sideKey][stationKey];
                const stationStored = storedLoadout[sideKey][stationKey];
                stationTemplate.quantity = stationStored.quantity;
                stationTemplate.load = stationStored.load;
                stationTemplate.display = stationStored.display;
                stationTemplate.type = stationStored.type;
            }
        }

        this.currentLoadout = baseTemplate;

        for (const key of Object.keys(this.selectedWeaponByMode)) {
            delete this.selectedWeaponByMode[key];
        }

        const storedSelected = parsed.selected;
        for (const modeKey of Object.keys(storedSelected)) {
            const selected = storedSelected[modeKey];
            this.selectedWeaponByMode[modeKey] = {
                side: selected.side,
                station: selected.station
            };
        }

        this.rearmState.config = parsed.config;
    }

    resolveTemplateConfig(config) {
        if (this.loadoutTemplates[config]) return config;
        if (this.loadoutTemplates['A/A']) return 'A/A';
        return Object.keys(this.loadoutTemplates)[0];
    }

    getRearmTemplateByMode(config) {
        const resolvedConfig = this.resolveTemplateConfig(config);
        const sourceTemplate = this.loadoutTemplates[resolvedConfig];
        if (!sourceTemplate) return null;
        return HelperModule.deepCloneJson(sourceTemplate);
    }

    zeroCurrentLoadout() {
        if (!this.currentLoadout) return;
        this.currentLoadout.gun = 0;
        for (const sideKey of ['left', 'right']) {
            const sideStations = this.currentLoadout[sideKey];
            for (const stationKey of Object.keys(sideStations)) {
                if (!Number.isFinite(sideStations[stationKey].quantity)) continue;
                sideStations[stationKey].quantity = 0;
            }
        }
    }

    applyRearmProgress(targetByMode, progress) {
        const p = Math.max(0, Math.min(1, progress));
        if (!this.currentLoadout || !targetByMode) return;

        this.currentLoadout.gun = Math.floor(targetByMode.gun * p);

        for (const sideKey of ['left', 'right']) {
            this.currentLoadout[sideKey] = this.currentLoadout[sideKey] ?? {};
            const targetSide = targetByMode[sideKey] ?? {};
            for (const stationKey of Object.keys(targetSide)) {
                const targetStation = targetSide[stationKey] ?? {};
                this.currentLoadout[sideKey][stationKey] = this.currentLoadout[sideKey][stationKey] ?? {};
                this.currentLoadout[sideKey][stationKey].load = targetStation.load;
                this.currentLoadout[sideKey][stationKey].display = targetStation.display;
                this.currentLoadout[sideKey][stationKey].type = targetStation.type;

                const targetQuantity = Number.isFinite(targetStation.quantity) ? targetStation.quantity : 0;
                this.currentLoadout[sideKey][stationKey].quantity = Math.floor(targetQuantity * p);
            }
        }
    }

    startRearm(config) {
        if (this.rearmState.active) return false;
        if (!HelperModule.isAircraftParkedAndCold()
            || OptionModule.getOption('WPN', 'MASTER', 'OFF') !== 'OFF') {
            return false;
        }

        const resolvedConfig = this.resolveTemplateConfig(config);
        const targetByMode = this.getRearmTemplateByMode(resolvedConfig);
        if (!resolvedConfig || !targetByMode) return false;

        this.zeroCurrentLoadout();
        for (const modeKey of Object.keys(this.selectedWeaponByMode)) {
            delete this.selectedWeaponByMode[modeKey];
        }

        this.rearmState.active = true;
        this.rearmState.startTime = Date.now();
        this.rearmState.progress = 0;
        this.rearmState.config = resolvedConfig;
        this.rearmState.status = 'REARMING';
        this.rearmState.lastSavedPercent = -1;
        this.rearmState.targetByMode = targetByMode;
        this.saveStateToStorage();
        return true;
    }

    updateRearmState() {
        if (!this.rearmState.active) return;
        if (window.geofs?.animation?.values?.enginesOn) {
            this.rearmState.active = false;
            this.rearmState.status = 'ABORTED';
            this.rearmState.targetByMode = null;
            this.saveStateToStorage();
            return;
        }

        const elapsed = Date.now() - this.rearmState.startTime;
        const duration = Math.max(1, Number.isFinite(this.rearmState.durationMs) ? this.rearmState.durationMs : this.REARM_DURATION_MS);
        const progress = Math.max(0, Math.min(1, elapsed / duration));

        this.rearmState.progress = progress;
        this.applyRearmProgress(this.rearmState.targetByMode, progress);

        const percent = Math.round(progress * 100);
        if (percent !== this.rearmState.lastSavedPercent) {
            this.rearmState.lastSavedPercent = percent;
            this.saveStateToStorage();
        }

        if (progress >= 1) {
            this.rearmState.active = false;
            this.rearmState.status = 'READY';
            this.rearmState.targetByMode = null;
            this.saveStateToStorage();
        }
    }

    stopGunFireTimer() {
        const wasFiring = this.gunFireState.firing;
        this.gunFireState.firing = false;
        if (this.gunFireState.timerId) {
            clearTimeout(this.gunFireState.timerId);
            this.gunFireState.timerId = null;
        }
        this.gunFireState.mode = null;
        this.gunFireState.roundsRemainingInBurst = 0;
        this.gunFireState.triggerHeld = false;
        this.gunFireState.accumulator = 0;
        if (wasFiring) this.emit('gunstate', { firing: false });
    }

    processGunFireTick() {
        const state = this.gunFireState;
        const now = performance.now();
        const elapsedSeconds = Math.min(0.2, Math.max(0, (now - state.lastTickAt) / 1000));
        state.lastTickAt = now;
        state.accumulator += elapsedSeconds * this.GUN_FIRE_RATE_RPS;
        let roundsDue = Math.floor(state.accumulator);
        state.accumulator -= roundsDue;

        const mode = state.mode;
        const modeLoadout = this.getModeLoadout(mode);

        // Emit one event per round so projectile and multiplayer modules can
        // reproduce the real gun cadence instead of only seeing the burst.
        while (roundsDue > 0 && (state.triggerHeld || state.roundsRemainingInBurst > 0)) {
            if (!(modeLoadout.gun > 0)) break;
            modeLoadout.gun -= 1;
            if (!state.triggerHeld) state.roundsRemainingInBurst -= 1;
            roundsDue -= 1;
            this.emitFireEvent(mode, { side: 'center', station: 'gun' }, { load: 'GUN' });
        }

        if (!(modeLoadout.gun > 0)) {
            this.stopGunFireTimer();
            this.selectNextWeapon(mode, modeLoadout, 0);
            this.saveStateToStorage();
            return;
        }

        if (!state.triggerHeld && state.roundsRemainingInBurst <= 0) {
            this.stopGunFireTimer();
            this.saveStateToStorage();
            return;
        }

        state.timerId = setTimeout(() => this.processGunFireTick(), this.GUN_FIRE_TICK_MS);
    }

    /** Starts the gun timer if idle; the first round is due immediately. */
    beginGunFireTimer(mode) {
        const state = this.gunFireState;
        state.mode = mode;
        if (state.firing) return;
        state.lastTickAt = performance.now();
        state.accumulator = 1;
        this.emit('gunstate', { firing: true });
        this.triggerFireFlash();
        state.firing = true;
        this.processGunFireTick();
    }

    /** Fires a fixed-size burst (used by the MFD FIRE button). */
    startGunFire(mode, modeLoadout) {
        if (!modeLoadout || !Number.isFinite(modeLoadout.gun) || modeLoadout.gun <= 0) {
            this.emit('dryfire', { weapon: 'GUN' });
            return false;
        }
        this.gunFireState.roundsRemainingInBurst += this.GUN_ROUNDS_PER_BURST;
        this.beginGunFireTimer(mode);
        return true;
    }

    /** Fires continuously until `releaseTrigger()` (used by the keyboard trigger). */
    startGunTrigger(mode, modeLoadout) {
        if (!modeLoadout || !Number.isFinite(modeLoadout.gun) || modeLoadout.gun <= 0) {
            this.emit('dryfire', { weapon: 'GUN' });
            return false;
        }
        this.gunFireState.triggerHeld = true;
        this.beginGunFireTimer(mode);
        return true;
    }

    /**
     * Pulls the trigger for the selected weapon: guns fire while held, missiles
     * launch once. Returns false when nothing was fired (master off, no lock ...).
     */
    pressTrigger() {
        const mode = OptionModule.getOption('WPN', 'MODE', 'NAV');
        if (mode === 'NAV' || mode === 'JETTISON') {
            this.emit('blocked', { reason: 'mode', mode });
            return false;
        }
        if (OptionModule.getOption('WPN', 'MASTER', 'OFF') === 'OFF') {
            this.emit('blocked', { reason: 'master' });
            return false;
        }
        const modeLoadout = this.getModeLoadout(mode);
        let selected = this.ensureSelectedWeapon(mode, modeLoadout);
        if (!selected && this.selectNextWeapon(mode, modeLoadout, 0)) {
            selected = this.ensureSelectedWeapon(mode, modeLoadout);
        }
        if (selected?.station === 'gun') return this.startGunTrigger(mode, modeLoadout);
        return this.fireSelectedWeapon(mode, modeLoadout);
    }

    releaseTrigger() {
        if (!this.gunFireState.triggerHeld) return;
        this.gunFireState.triggerHeld = false;
        if (this.gunFireState.roundsRemainingInBurst <= 0) {
            this.stopGunFireTimer();
            this.saveStateToStorage();
        }
    }
    triggerActionFlash(label = 'FIRE') {
        this.fireFlash.startTime = Date.now();
        this.fireFlash.label = label;
    }

    triggerFireFlash() {
        this.triggerActionFlash('FIRE');
    }

    getActionFlashLabel() {
        return this.fireFlash.label || 'FIRE';
    }

    isFireFlashVisible() {
        if (!this.fireFlash.startTime) return false;
        const elapsed = Date.now() - this.fireFlash.startTime;
        const totalDuration = this.FIRE_BLINK_INTERVAL_MS * this.FIRE_BLINK_PHASES;
        if (elapsed >= totalDuration) {
            this.fireFlash.startTime = 0;
            this.fireFlash.label = 'FIRE';
            return false;
        }
        return Math.floor(elapsed / this.FIRE_BLINK_INTERVAL_MS) % 2 === 0;
    }

    getModeLoadout() {
        return this.currentLoadout ?? null;
    }

    getStationQuantity(modeLoadout, side, station) {
        if (station === 'gun') {
            const gun = modeLoadout?.gun;
            return Number.isFinite(gun) ? gun : 0;
        }
        const q = modeLoadout?.[side]?.[station]?.quantity;
        return Number.isFinite(q) ? q : 0;
    }

    canUseStationForMode(mode, modeLoadout, side, station, minimumQuantity = 0) {
        if (!modeLoadout || !station) return false;
        if (station === 'gun') {
            if (!this.isModeCompatibleStation(mode, station, null)) return false;
            return this.getStationQuantity(modeLoadout, side, station) > minimumQuantity;
        }
        const stationData = modeLoadout?.[side]?.[station];
        if (!stationData) return false;
        if (!this.isModeCompatibleStation(mode, station, stationData)) return false;
        return this.getStationQuantity(modeLoadout, side, station) > minimumQuantity;
    }

    ensureSelectedWeapon(mode, modeLoadout) {
        if (!modeLoadout) return null;

        const current = this.selectedWeaponByMode[mode];
        if (current?.station === 'gun' && Number.isFinite(modeLoadout?.gun)) {
            if (!this.isModeCompatibleStation(mode, 'gun', null)) return null;
            return current;
        }
        if (current?.side && current?.station && modeLoadout?.[current.side]?.[current.station]) {
            const stationData = modeLoadout[current.side][current.station];
            if (!this.isModeCompatibleStation(mode, current.station, stationData)) return null;
            return current;
        }
        return null;
    }

    getSelectedLoadDisplay(mode, modeLoadout) {
        const selected = this.ensureSelectedWeapon(mode, modeLoadout);
        if (!selected) return 'N/A';
        if (selected.station === 'gun') return 'GUN';
        const station = modeLoadout?.[selected.side]?.[selected.station];
        return station?.load ?? 'N/A';
    }

    getSelectedQuantityLine(mode, modeLoadout) {
        const selected = this.ensureSelectedWeapon(mode, modeLoadout);
        if (!selected) return 'N/A';
        if (selected.station === 'gun') {
            const quantity = Number.isFinite(modeLoadout?.gun) ? modeLoadout.gun : 0;
            return `${quantity}x GUN`;
        }
        const station = modeLoadout?.[selected.side]?.[selected.station];
        if (!station) return 'N/A';
        const quantity = Number.isFinite(station.quantity) ? station.quantity : 0;
        const load = station.load ?? station.display ?? 'N/A';
        return `${quantity}x ${load}`;
    }

    getSelectedWeaponEffectiveness(mode, modeLoadout) {
        const selected = this.ensureSelectedWeapon(mode, modeLoadout);
        if (!selected || selected.station === 'gun') return null;
        const station = modeLoadout[selected.side][selected.station];
        const profile = WeaponModule.effectivenessByType.find((item) => item.name === station.load);
        if (!profile) return null;
        return profile;
    }

    getEffectivenessMarkerFractions(profile) {
        const minEngagement = profile.engagement_window.min;
        const maxEngagement = profile.engagement_window.max;
        const span = maxEngagement - minEngagement;

        return {
            engagementMax: 0,
            effectiveMax: (maxEngagement - profile.effective_range.max) / span,
            effectiveMin: (maxEngagement - profile.effective_range.min) / span,
            engagementMin: 1
        };
    }

    getEffectivenessDistanceFraction(profile, distanceNm) {
        const minEngagement = profile.engagement_window.min;
        const maxEngagement = profile.engagement_window.max;
        const span = maxEngagement - minEngagement;
        const fraction = (maxEngagement - distanceNm) / span;
        return HelperModule.clampValue(fraction, 0, 1);
    }

    hasRadarHardLock() {
        const addon = window.BasePlugin?.getActiveAddon?.();
        if (addon?.combat?.targets) return addon.combat.targets.hasLock();
        return !!addon?.radar?.hardLockedUid;
    }

    selectNextWeapon(mode, modeLoadout, minimumQuantity = 0) {
        if (!modeLoadout) return false;
        const current = this.ensureSelectedWeapon(mode, modeLoadout);
        const currentIndex = current
            ? Math.max(0, this.STATION_RENDER_ORDER.findIndex((s) => s.side === current.side && s.station === current.station))
            : -1;

        for (let step = 1; step <= this.STATION_RENDER_ORDER.length; step++) {
            const index = (currentIndex + step) % this.STATION_RENDER_ORDER.length;
            const candidate = this.STATION_RENDER_ORDER[index];
            if (!this.canUseStationForMode(mode, modeLoadout, candidate.side, candidate.station, minimumQuantity)) continue;
            this.selectedWeaponByMode[mode] = { side: candidate.side, station: candidate.station };
            this.saveStateToStorage();
            return true;
        }
        return false;
    }

    selectPreviousWeapon(mode, modeLoadout, minimumQuantity = 0) {
        if (!modeLoadout) return false;
        const current = this.ensureSelectedWeapon(mode, modeLoadout);
        const currentIndex = current
            ? this.STATION_RENDER_ORDER.findIndex((s) => s.side === current.side && s.station === current.station)
            : 0;
        for (let step = 1; step <= this.STATION_RENDER_ORDER.length; step += 1) {
            const index = (currentIndex - step + this.STATION_RENDER_ORDER.length)
                % this.STATION_RENDER_ORDER.length;
            const candidate = this.STATION_RENDER_ORDER[index];
            if (!this.canUseStationForMode(mode, modeLoadout, candidate.side, candidate.station, minimumQuantity)) continue;
            this.selectedWeaponByMode[mode] = { side: candidate.side, station: candidate.station };
            this.saveStateToStorage();
            return true;
        }
        return false;
    }

    selectSameWeaponHardpoint(mode, modeLoadout, selected) {
        if (!modeLoadout || !selected) return false;
        if (selected.station === 'gun') return false;
        if (!String(selected.station).startsWith('hardpoint')) return false;

        const currentStation = modeLoadout?.[selected.side]?.[selected.station];
        const currentLoadType = currentStation?.load;
        if (!currentLoadType) return false;
        if (!this.isModeCompatibleStation(mode, selected.station, currentStation)) return false;

        const selectedIndex = this.STATION_RENDER_ORDER.findIndex((s) => s.side === selected.side && s.station === selected.station);
        if (selectedIndex < 0) return false;

        for (let step = 1; step <= this.STATION_RENDER_ORDER.length; step++) {
            const index = (selectedIndex + step) % this.STATION_RENDER_ORDER.length;
            const candidate = this.STATION_RENDER_ORDER[index];
            if (!candidate?.station || !String(candidate.station).startsWith('hardpoint')) continue;
            const candidateStation = modeLoadout?.[candidate.side]?.[candidate.station];
            if (!candidateStation) continue;
            if (candidateStation.load !== currentLoadType) continue;
            if (!this.isModeCompatibleStation(mode, candidate.station, candidateStation)) continue;
            if (!Number.isFinite(candidateStation.quantity) || candidateStation.quantity <= 0) continue;

            this.selectedWeaponByMode[mode] = { side: candidate.side, station: candidate.station };
            this.saveStateToStorage();
            return true;
        }
        return false;
    }

    /** Subscribe to weapon lifecycle events. Returns an unsubscribe function. */
    on(eventName, listener) {
        if (typeof listener !== 'function') return () => {};
        if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
        this.listeners.get(eventName).add(listener);
        return () => this.off(eventName, listener);
    }

    off(eventName, listener) {
        this.listeners.get(eventName)?.delete(listener);
    }

    emit(eventName, payload) {
        for (const listener of this.listeners.get(eventName) ?? []) {
            try { listener(payload); } catch (error) { console.error(`[WeaponModule] ${eventName} listener failed`, error); }
        }
    }

    emitFireEvent(mode, selected, station) {
        const load = station?.load ?? (selected?.station === 'gun' ? 'GUN' : null);
        const profile = load
            ? WeaponModule.effectivenessByType.find((item) => item.name === load)
            : null;
        const projectile = load === 'GUN'
            ? { ...WeaponModule.gunMetadata }
            : { ...WeaponModule.defaultMissileMetadata, ...(WeaponModule.projectileMetadataByType[load] ?? {}) };
        this.emit('fire', {
            mode,
            selected: selected ? { ...selected } : null,
            weapon: load,
            metadata: {
                engagement_window: profile ? { ...profile.engagement_window } : null,
                effective_range: profile ? { ...profile.effective_range } : null,
                projectile
            }
        });
    }
    fireSelectedWeapon(mode, modeLoadout) {
        if (!modeLoadout) return false;
        if (mode === 'NAV' || mode === 'JETTISON') return false;
        if (OptionModule.getOption('WPN', 'MASTER', 'OFF') === 'OFF') return false;

        let selected = this.ensureSelectedWeapon(mode, modeLoadout);
        if (!selected) {
            if (!this.selectNextWeapon(mode, modeLoadout, 0)) return false;
            selected = this.ensureSelectedWeapon(mode, modeLoadout);
            if (!selected) return false;
        }

        if (selected.station === 'gun') return this.startGunFire(mode, modeLoadout);
        if (!this.hasRadarHardLock()) {
            this.emit('blocked', { reason: 'lock' });
            return false;
        }

        const station = modeLoadout?.[selected.side]?.[selected.station];
        if (!station || !Number.isFinite(station.quantity)) return false;

        if (station.quantity <= 0) {
            this.emit('dryfire', { weapon: station.load });
            if (!this.selectSameWeaponHardpoint(mode, modeLoadout, selected)) {
                this.selectNextWeapon(mode, modeLoadout, 0);
            }
            return false;
        }

        station.quantity -= 1;
        this.triggerFireFlash();
        this.emitFireEvent(mode, selected, station);
        this.saveStateToStorage();

        if (station.quantity <= 0) {
            if (!this.selectSameWeaponHardpoint(mode, modeLoadout, selected)) {
                this.selectNextWeapon(mode, modeLoadout, 0);
            }
        }
        return true;
    }

    jettisonSelectedWeapon(mode, modeLoadout) {
        if (!modeLoadout) return false;
        if (mode !== 'JETTISON') return false;

        let selected = this.ensureSelectedWeapon(mode, modeLoadout);
        if (!selected) {
            if (!this.selectNextWeapon(mode, modeLoadout, 0)) return false;
            selected = this.ensureSelectedWeapon(mode, modeLoadout);
            if (!selected) return false;
        }

        if (selected.station === 'gun') return false;

        const station = modeLoadout?.[selected.side]?.[selected.station];
        if (!station || !Number.isFinite(station.quantity)) return false;

        if (station.quantity <= 0) {
            this.emit('dryfire', { weapon: station.load });
            if (!this.selectSameWeaponHardpoint(mode, modeLoadout, selected)) {
                this.selectNextWeapon(mode, modeLoadout, 0);
            }
            return false;
        }

        station.quantity = 0;
        this.triggerActionFlash('JETT');
        this.saveStateToStorage();

        if (!this.selectSameWeaponHardpoint(mode, modeLoadout, selected)) {
            this.selectNextWeapon(mode, modeLoadout, 0);
        }
        return true;
    }
}
