class F18HudModule {
  static HUD_PHYSICAL_HEIGHT_M = 0.30;
  static HUD_PARALLAX_GAIN = 1.65;
  static CAMERA_TO_HUD_DISTANCE_M = 0.92;
  static DEFAULT_COLOR = '#00ff00';
  static RAD_TO_DEG = 180 / Math.PI;
  static DEG_TO_RAD = Math.PI / 180;
  static LADDER_TICK_RANGE_DEG = 85;
  static REFERENCE_MOVEMENT_MIN_METERS = 0.01;
  static FLIGHT_PATH_REFERENCE_REPLACEMENT_DEG = 3;

  // Prepares HUD module state and renderer references.
  constructor(dependencies = {}) {
    this.dependencies = {
      optionModule: dependencies.optionModule ?? OptionModule,
      helperModule: dependencies.helperModule ?? HelperModule,
      cameraModule: dependencies.cameraModule ?? CameraModule,
      mfdModule: dependencies.mfdModule ?? MfdModule,
      hudCombinerConfig: dependencies.hudCombinerConfig ?? null,
      getAddon: dependencies.getAddon ?? (() => window.BasePlugin?.getActiveAddon?.() ?? null)
    };
    this.originalRenderer = null;
    this.installed = false;
    this.isPitchLadderCaged = false;
    this.isHudProjectionDebug = false;
    this.lastHudProjectionDebugAt = 0;
    this.hasReportedProjectionFailure = false;
    this.fpvState = {
      lastLat: null,
      lastLon: null,
      lastAlt: null,
      relAzDeg: 0,
      relElDeg: 0,
      valid: false
    };
    this.referenceFlightPathState = {
      previousAircraftPosition: null
    };
    this.maxG = 1;
  }

  getAddon() {
    return this.dependencies.getAddon?.() ?? null;
  }

  getOption(pageTitle, buttonKey, fallback = null) {
    return this.dependencies.optionModule?.getOption?.(pageTitle, buttonKey, fallback);
  }

  setOption(pageTitle, buttonKey, value) {
    return this.dependencies.optionModule?.setOption?.(pageTitle, buttonKey, value);
  }

  getOptionValue(pageTitle, buttonKey, fallback = null) {
    return this.dependencies.optionModule?.getOptionValue?.(pageTitle, buttonKey, fallback);
  }

  getMfdBrightnessFactor() {
    return this.getAddon()?.mfd?.getMfdBrightnessFactor?.() ?? 0.6;
  }

  applyBrightnessToHexColor(color, factor) {
    return this.getAddon()?.mfd?.applyBrightnessToHexColor?.(color, factor) ?? color;
  }

  getWpnModeFromOptions() {
    return this.getAddon()?.weapons?.getModeFromOptions?.() ?? 'NAV';
  }

  getWpnModeLoadout(mode) {
    return this.getAddon()?.weapons?.getModeLoadout?.(mode) ?? null;
  }

  getSelectedWpnQuantityLine(mode, modeLoadout) {
    return this.getAddon()?.weapons?.getSelectedQuantityLine?.(mode, modeLoadout) ?? 'N/A';
  }

  updateWpnRearmState() {
    return this.getAddon()?.weapons?.updateRearmState?.();
  }

  isWpnFireFlashVisible() {
    return this.getAddon()?.weapons?.isFireFlashVisible?.() ?? false;
  }

  getWpnActionFlashLabel() {
    return this.getAddon()?.weapons?.getActionFlashLabel?.() ?? 'FIRE';
  }

  getNavModule() {
    return this.getAddon()?.nav ?? null;
  }

  getCommunicationModule() {
    return this.getAddon()?.communication ?? null;
  }

  registerMfdPages(mfdModule = this.dependencies.mfdModule) {
    mfdModule.registerPage({
      title: 'HUD',
      leftButtons: [
        {
          key: 'HUD',
          label: 'HUD',
          states: ['F-18', 'DEFAULT'],
          stateIndex: 0,
          onClick: ({ nextState }) => {
            this.setMode(nextState);
          }
        },
        { key: 'BRIGHT', label: 'BRT', states: ['NORM', 'DAY', 'NIGHT'], stateIndex: 0 },
        { key: 'LEVEL', label: 'LVL', states: ['FULL', 'DECLUTTERED', 'MIN'], stateIndex: 0 },
        {
          key: 'MAX_G',
          label: 'MAXG',
          states: ['RESET'],
          stateIndex: 0,
          onClick: () => {
            const currentLoadFactor = window.geofs?.animation?.values?.loadFactor;
            this.maxG = Number.isFinite(currentLoadFactor) ? currentLoadFactor : 1;
          }
        },
      ],
      rightButtons: [
        { key: 'COLOR', label: 'COLOR', states: ['GREEN', 'WHITE', 'BLUE', 'RED'], values: ['#00FF00', '#FFFFFF', '#00fffb', '#FF0000'], stateIndex: 0 },
      ],
      lines: []
    });
    return true;
  }

  // Installs the custom HUD renderer while preserving the original one.
  static isAircraftActive() {
    return Boolean(window.BasePlugin?.getActivePlugin?.()?.isAircraftActive?.());
  }

  install() {
    if (this.installed) {
      return true;
    }

    const renderers = window.instruments?.renderers;
    if (!renderers?.genericHUD) {
      return false;
    }

    if (!window.__GeoFsOriginalGenericHudRenderer) {
      window.__GeoFsOriginalGenericHudRenderer = renderers.genericHUD;
    }

    this.originalRenderer = window.__GeoFsOriginalGenericHudRenderer;
    const self = this;
    renderers.genericHUD = function (renderer) {
      if (!F18HudModule.isAircraftActive() || self.getOption('HUD', 'HUD', 'F-18') === 'DEFAULT') {
        return window.__GeoFsOriginalGenericHudRenderer.call(this, renderer);
      }
      self.renderF18Hud(renderer);
    };

    this.installed = true;
    return true;
  }

  getMode() {
    return this.getOption('HUD', 'HUD', 'F-18');
  }

  setMode(mode) {
    this.setOption('HUD', 'HUD', mode);
    this.ensureLoaded();
    return mode;
  }

  // Ensures the HUD renderer is installed and active.
  ensureLoaded() {
    if (this.getOption('HUD', 'HUD', 'F-18') === 'DEFAULT') {
      this.restore();
      return true;
    }

    if (!this.install()) {
      return false;
    }
    return true;
  }

  // Restores the original HUD renderer and clears install state.
  restore() {
    if (window.__GeoFsOriginalGenericHudRenderer && window.instruments?.renderers) {
      window.instruments.renderers.genericHUD = window.__GeoFsOriginalGenericHudRenderer;
    }
    this.originalRenderer = null;
    this.installed = false;
  }

  static isFiniteVector(vector, length = 3) {
    return Array.isArray(vector)
      && vector.length === length
      && vector.every((value) => Number.isFinite(value));
  }

  static addVectors(left, right) {
    return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
  }

  static subtractVectors(left, right) {
    return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
  }

  static scaleVector(vector, scalar) {
    return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
  }

  static dotProduct(left, right) {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
  }

  static crossProduct(left, right) {
    return [
      left[1] * right[2] - left[2] * right[1],
      left[2] * right[0] - left[0] * right[2],
      left[0] * right[1] - left[1] * right[0]
    ];
  }

  static normalizeVector(vector) {
    if (!this.isFiniteVector(vector)) return null;
    const length = Math.hypot(vector[0], vector[1], vector[2]);
    if (!Number.isFinite(length) || length < 1e-8) return null;
    return this.scaleVector(vector, 1 / length);
  }

  static angleBetweenDegrees(left, right) {
    if (!left || !right) return null;
    const cosine = Math.max(-1, Math.min(1, this.dotProduct(left, right)));
    return Math.acos(cosine) * this.RAD_TO_DEG;
  }

  static rotateVector(vector, axis, angleRad) {
    const normalizedAxis = this.normalizeVector(axis);
    if (!normalizedAxis) return null;
    const cosine = Math.cos(angleRad);
    const sine = Math.sin(angleRad);
    return this.addVectors(
      this.addVectors(
        this.scaleVector(vector, cosine),
        this.scaleVector(this.crossProduct(normalizedAxis, vector), sine)
      ),
      this.scaleVector(normalizedAxis, this.dotProduct(normalizedAxis, vector) * (1 - cosine))
    );
  }

  static isValidCombinerConfig(config) {
    if (!config || !this.isFiniteVector(config.origin) || !this.isFiniteVector(config.normal)
      || !this.isFiniteVector(config.right) || !this.isFiniteVector(config.up)
      || !Array.isArray(config.outline) || config.outline.length < 3) {
      return false;
    }

    const normal = this.normalizeVector(config.normal);
    const right = this.normalizeVector(config.right);
    const up = this.normalizeVector(config.up);
    return Boolean(normal && right && up
      && Math.abs(this.dotProduct(normal, right)) < 1e-4
      && Math.abs(this.dotProduct(normal, up)) < 1e-4
      && Math.abs(this.dotProduct(right, up)) < 1e-4
      && config.outline.every((point) => Array.isArray(point) && point.length === 2
        && point.every((value) => Number.isFinite(value))));
  }

  reportProjectionFailure(reason) {
    if (this.hasReportedProjectionFailure) return;
    this.hasReportedProjectionFailure = true;
    console.warn(`[F18HudModule] Attitude HUD projection unavailable: ${reason}`);
  }

  getCameraCombinerDistance(frame) {
    return Math.hypot(
      frame.cameraPosition[0] - frame.combiner.origin[0],
      frame.cameraPosition[1] - frame.combiner.origin[1],
      frame.cameraPosition[2] - frame.combiner.origin[2]
    );
  }

  projectCombinerPoint(frame, point) {
    // GeoFS maps the HUD canvas onto the 3D glass after this texture-space projection.
    const relative = F18HudModule.subtractVectors(point, frame.combiner.origin);
    const right = F18HudModule.dotProduct(relative, frame.combiner.right);
    const up = F18HudModule.dotProduct(relative, frame.combiner.up);
    const { minRight, maxRight, minUp, maxUp } = frame.combiner.bounds;
    const width = maxRight - minRight;
    const height = maxUp - minUp;
    if (width <= 0 || height <= 0) return null;
    return {
      x: ((right - minRight) / width) * frame.viewport.width,
      y: ((maxUp - up) / height) * frame.viewport.height,
      worldPoint: point
    };
  }

  projectWorldDirection(frame, direction) {
    const normalizedDirection = F18HudModule.normalizeVector(direction);
    if (!normalizedDirection) return null;

    const denominator = F18HudModule.dotProduct(normalizedDirection, frame.combiner.normal);
    if (Math.abs(denominator) < 1e-8) return null;

    const distance = F18HudModule.dotProduct(
      F18HudModule.subtractVectors(frame.combiner.origin, frame.cameraPosition),
      frame.combiner.normal
    ) / denominator;
    if (!Number.isFinite(distance) || distance <= 0) return null;

    const point = F18HudModule.addVectors(
      frame.cameraPosition,
      F18HudModule.scaleVector(normalizedDirection, distance)
    );
    return this.projectCombinerPoint(frame, point);
  }

  collectHudProjectionInputs(renderer, ac) {
    const config = this.dependencies.hudCombinerConfig;
    const viewer = window.geofs?.api?.viewer;
    const sceneCamera = viewer?.scene?.camera ?? viewer?.camera;
    const CesiumApi = window.Cesium;
    const canvas = renderer?.canvasAPI?.canvas ?? renderer?.canvasAPI?.context?.canvas;
    const lla = ac?.llaLocation;

    if (!F18HudModule.isValidCombinerConfig(config)) {
      this.reportProjectionFailure('HUD combiner configuration is invalid');
      return null;
    }
    if (!canvas || !viewer?.canvas || !sceneCamera?.positionWC || !CesiumApi || !Array.isArray(lla)
      || !F18HudModule.isFiniteVector(lla) || !ac?.object3d?.setVectorWorldPosition) {
      this.reportProjectionFailure('required GeoFS camera, aircraft, or Cesium data is missing');
      return null;
    }

    const ellipsoid = viewer.scene?.globe?.ellipsoid ?? CesiumApi.Ellipsoid.WGS84;
    const aircraftPosition = CesiumApi.Cartesian3.fromDegrees(lla[1], lla[0], lla[2]);
    const currentAircraftPosition = [aircraftPosition.x, aircraftPosition.y, aircraftPosition.z];
    const enuToWorld = CesiumApi.Transforms.eastNorthUpToFixedFrame(aircraftPosition, ellipsoid);
    const transformSamples = new Map();
    const isTrackedTransformPoint = (localPoint) => this.isHudProjectionDebug && (
      localPoint.every((value, index) => value === config.origin[index])
      || localPoint.every((value) => value === 0)
    );

    const localPointToWorld = (localPoint) => {
      const localEnu = ac.object3d.setVectorWorldPosition([...localPoint]);
      if (!F18HudModule.isFiniteVector(localEnu)) return null;
      const world = CesiumApi.Matrix4.multiplyByPoint(
        enuToWorld,
        new CesiumApi.Cartesian3(localEnu[0], localEnu[1], localEnu[2]),
        new CesiumApi.Cartesian3()
      );
      const worldPoint = [world.x, world.y, world.z];
      if (isTrackedTransformPoint(localPoint)) {
        transformSamples.set(localPoint.join(','), {
          localPoint: [...localPoint],
          setVectorWorldPositionResult: [...localEnu],
          versionAWorld: worldPoint
        });
      }
      return worldPoint;
    };

    const combinerOrigin = localPointToWorld(config.origin);
    const normalPoint = localPointToWorld(F18HudModule.addVectors(config.origin, config.normal));
    const rightPoint = localPointToWorld(F18HudModule.addVectors(config.origin, config.right));
    const upPoint = localPointToWorld(F18HudModule.addVectors(config.origin, config.up));
    if (!combinerOrigin || !normalPoint || !rightPoint || !upPoint) {
      this.reportProjectionFailure('aircraft-local combiner transform failed');
      return null;
    }

    const combiner = {
      origin: combinerOrigin,
      normal: F18HudModule.normalizeVector(F18HudModule.subtractVectors(normalPoint, combinerOrigin)),
      right: F18HudModule.normalizeVector(F18HudModule.subtractVectors(rightPoint, combinerOrigin)),
      up: F18HudModule.normalizeVector(F18HudModule.subtractVectors(upPoint, combinerOrigin))
    };
    if (!combiner.normal || !combiner.right || !combiner.up) {
      this.reportProjectionFailure('combiner axes are degenerate after transformation');
      return null;
    }

    combiner.outline = config.outline.map(([rightOffset, upOffset]) => localPointToWorld(
      F18HudModule.addVectors(
        config.origin,
        F18HudModule.addVectors(
          F18HudModule.scaleVector(config.right, rightOffset),
          F18HudModule.scaleVector(config.up, upOffset)
        )
      )
    ));
    if (combiner.outline.some((point) => !point)) {
      this.reportProjectionFailure('aircraft-local combiner outline transform failed');
      return null;
    }
    combiner.bounds = {
      minRight: Math.min(...combiner.outline.map((point) => F18HudModule.dotProduct(
        F18HudModule.subtractVectors(point, combiner.origin),
        combiner.right
      ))),
      maxRight: Math.max(...combiner.outline.map((point) => F18HudModule.dotProduct(
        F18HudModule.subtractVectors(point, combiner.origin),
        combiner.right
      ))),
      minUp: Math.min(...combiner.outline.map((point) => F18HudModule.dotProduct(
        F18HudModule.subtractVectors(point, combiner.origin),
        combiner.up
      ))),
      maxUp: Math.max(...combiner.outline.map((point) => F18HudModule.dotProduct(
        F18HudModule.subtractVectors(point, combiner.origin),
        combiner.up
      )))
    };

    const cameraPosition = sceneCamera.positionWC;
    const cameraWorld = [cameraPosition.x, cameraPosition.y, cameraPosition.z];
    const inverseEnuToWorld = CesiumApi.Matrix4.inverseTransformation(
      enuToWorld,
      new CesiumApi.Matrix4()
    );
    const cameraEnuCartesian = CesiumApi.Matrix4.multiplyByPoint(
      inverseEnuToWorld,
      cameraPosition,
      new CesiumApi.Cartesian3()
    );
    const cameraEnu = [cameraEnuCartesian.x, cameraEnuCartesian.y, cameraEnuCartesian.z];
    const earthUpCartesian = ellipsoid.geodeticSurfaceNormal(aircraftPosition, new CesiumApi.Cartesian3());
    const earthUp = F18HudModule.normalizeVector([earthUpCartesian.x, earthUpCartesian.y, earthUpCartesian.z]);
    const aircraftOrigin = localPointToWorld([0, 0, 0]);
    const aircraftForwardPoint = localPointToWorld([0, 1, 0]);
    const boresightDirection = aircraftOrigin && aircraftForwardPoint
      ? F18HudModule.normalizeVector(F18HudModule.subtractVectors(aircraftForwardPoint, aircraftOrigin))
      : null;

    const airVelocity = F18HudModule.isFiniteVector(ac.airVelocity) ? [...ac.airVelocity] : null;
    const velocity = F18HudModule.isFiniteVector(ac.velocity) ? [...ac.velocity] : null;
    const localVelocity = airVelocity ?? velocity;
    const velocitySource = airVelocity ? 'airVelocity' : (velocity ? 'velocity' : null);
    let flightPathDirection = null;
    let velocityWorld = null;
    if (localVelocity) {
      const transformedVelocity = CesiumApi.Matrix4.multiplyByPointAsVector(
        enuToWorld,
        new CesiumApi.Cartesian3(localVelocity[0], localVelocity[1], localVelocity[2]),
        new CesiumApi.Cartesian3()
      );
      velocityWorld = [transformedVelocity.x, transformedVelocity.y, transformedVelocity.z];
      flightPathDirection = F18HudModule.normalizeVector([
        transformedVelocity.x,
        transformedVelocity.y,
        transformedVelocity.z
      ]);
    }

    const previousAircraftPosition = this.referenceFlightPathState.previousAircraftPosition;
    const movementVector = previousAircraftPosition
      ? F18HudModule.subtractVectors(currentAircraftPosition, previousAircraftPosition)
      : null;
    const movementDistance = movementVector ? Math.hypot(...movementVector) : 0;
    const referenceFlightPathDirection = movementDistance > F18HudModule.REFERENCE_MOVEMENT_MIN_METERS
      ? F18HudModule.normalizeVector(movementVector)
      : null;
    this.referenceFlightPathState.previousAircraftPosition = currentAircraftPosition;

    const flightPathReferenceDifferenceDeg = F18HudModule.angleBetweenDegrees(
      flightPathDirection,
      referenceFlightPathDirection
    );
    const shouldUseReferenceFlightPath = referenceFlightPathDirection
      && (!flightPathDirection
        || (flightPathReferenceDifferenceDeg != null
          && flightPathReferenceDifferenceDeg > F18HudModule.FLIGHT_PATH_REFERENCE_REPLACEMENT_DEG));
    const fpvFlightPathDirection = shouldUseReferenceFlightPath
      ? referenceFlightPathDirection
      : flightPathDirection;
    const fpvFlightPathSource = shouldUseReferenceFlightPath
      ? 'referenceMovement'
      : velocitySource;

    const frame = {
      Cesium: CesiumApi,
      ellipsoid,
      viewport: { width: canvas.width, height: canvas.height },
      cameraPosition: cameraWorld,
      earthUp,
      combiner,
      boresightDirection,
      flightPathDirection,
      referenceFlightPathDirection,
      flightPathReferenceDifferenceDeg,
      fpvFlightPathDirection,
      fpvFlightPathSource,
      movementDistance,
      airVelocity,
      velocity,
      velocityWorld,
      velocitySource,
      combinerConfigOrigin: [...config.origin]
    };
    const originTransform = transformSamples.get(config.origin.join(','));
    const rootTransform = transformSamples.get('0,0,0');
    if (originTransform) {
      const distanceBetween = (left, right) => Math.hypot(
        left[0] - right[0],
        left[1] - right[1],
        left[2] - right[2]
      );
      frame.transformDiagnostics = {
        origin: originTransform,
        root: rootTransform ?? null,
        cameraEnu,
        distanceA: distanceBetween(cameraWorld, originTransform.versionAWorld),
        distanceBWithEcefCamera: distanceBetween(
          cameraWorld,
          originTransform.setVectorWorldPositionResult
        ),
        distanceBInEnu: distanceBetween(
          cameraEnu,
          originTransform.setVectorWorldPositionResult
        )
      };
    }
    frame.outline = combiner.outline.map((point) => this.projectCombinerPoint(frame, point));
    if (!earthUp || !boresightDirection || frame.outline.some((point) => !point)) {
      this.reportProjectionFailure('Earth frame, boresight, or combiner outline could not be projected');
      return null;
    }
    return frame;
  }

  collectHudGeometryDebugData(frame, attitudeGeometry, flightPathSymbol, anim, ac) {
    const pointDistance = (left, right) => (left && right
      ? Math.hypot(right.x - left.x, right.y - left.y)
      : null);
    return {
      aircraftPitchDeg: -Number(anim.atilt ?? ac.htr?.[1] ?? 0),
      aircraftRollDeg: Number(anim.aroll ?? ac.htr?.[2] ?? 0),
      aircraftHeadingDeg: Number(anim.heading360 ?? anim.heading ?? ac.htr?.[0] ?? 0),
      verticalSpeed: Number(anim.climbrate ?? 0),
      boresightDirection: frame.boresightDirection,
      flightPathDirection: frame.flightPathDirection,
      referenceFlightPathDirection: frame.referenceFlightPathDirection,
      angleBetweenFlightPathDirectionsDeg: frame.flightPathReferenceDifferenceDeg,
      fpvFlightPathSource: frame.fpvFlightPathSource,
      movementDistance: frame.movementDistance,
      velocitySource: frame.velocitySource,
      airVelocity: frame.airVelocity,
      velocity: frame.velocity,
      velocityWorld: frame.velocityWorld,
      angleBetweenBoresightAndFlightPathDeg: F18HudModule.angleBetweenDegrees(
        frame.boresightDirection,
        frame.fpvFlightPathDirection
      ),
      camera: frame.cameraPosition,
      configOrigin: frame.combinerConfigOrigin,
      combiner: frame.combiner.origin,
      cameraToCombinerDistance: this.getCameraCombinerDistance(frame),
      transformDiagnostics: frame.transformDiagnostics ?? null,
      boresightPosition: frame.projectDirection(frame.boresightDirection),
      horizonCenter: attitudeGeometry.horizonCenter,
      ladderZeroCenter: attitudeGeometry.pitch0,
      fpvPosition: flightPathSymbol?.position ?? null,
      flightPathAngleDeg: flightPathSymbol?.flightPathAngleDeg ?? null,
      trackOffsetDeg: flightPathSymbol?.trackOffsetDeg ?? null,
      attitudePixelsPerDeg: attitudeGeometry.pixelsPerDeg,
      pitch0: attitudeGeometry.pitch0,
      pitch5: attitudeGeometry.pitch5,
      pitch10: attitudeGeometry.pitch10,
      pitchMinus5: attitudeGeometry.pitchMinus5,
      pitchMinus10: attitudeGeometry.pitchMinus10,
      delta0to5: pointDistance(
        attitudeGeometry.pitch0,
        attitudeGeometry.pitch5
      ),
      delta5to10: pointDistance(
        attitudeGeometry.pitch5,
        attitudeGeometry.pitch10
      ),
      horizonToLadderZeroPx: pointDistance(
        attitudeGeometry.horizonCenter,
        attitudeGeometry.pitch0
      ),
      horizonToFpvPx: pointDistance(
        attitudeGeometry.horizonCenter,
        flightPathSymbol?.position ?? null
      ),
      ladderZeroToFpvPx: pointDistance(
        attitudeGeometry.pitch0,
        flightPathSymbol?.position ?? null
      )
    };
  }

  reportHudGeometryDiagnostics(debugData) {
    if (!this.isHudProjectionDebug) return;
    const now = Date.now();
    if (now - this.lastHudProjectionDebugAt < 1000) return;
    this.lastHudProjectionDebugAt = now;
    console.log('[F18HudModule] HUD geometry', debugData);
    if (debugData.cameraToCombinerDistance > 2 || debugData.cameraToCombinerDistance < 0.2) {
      console.warn('[F18HudModule] Implausible camera-to-combiner distance', {
        distance: debugData.cameraToCombinerDistance,
        transformDiagnostics: debugData.transformDiagnostics
      });
    }
  }

  static getLegacyPixelsPerDegree(height) {
    const hudVerticalFovDeg = 2 * Math.atan(
      (F18HudModule.HUD_PHYSICAL_HEIGHT_M / 2) / F18HudModule.CAMERA_TO_HUD_DISTANCE_M
    ) * F18HudModule.RAD_TO_DEG;
    return height / hudVerticalFovDeg;
  }

  getLegacyHudGeometry(w, h) {
    const pixelsPerDeg = F18HudModule.getLegacyPixelsPerDegree(h);
    const hudPhysicalWidthM = F18HudModule.HUD_PHYSICAL_HEIGHT_M * (w / h);
    const hudHorizontalFovDeg = 2 * Math.atan(
      (hudPhysicalWidthM / 2) / F18HudModule.CAMERA_TO_HUD_DISTANCE_M
    ) * F18HudModule.RAD_TO_DEG;
    const pixelsPerDegX = w / hudHorizontalFovDeg;
    const mode = window.geofs?.camera?.modes?.[1];
    const baseZ = mode?.position?.[2] ?? this.dependencies.cameraModule?.DEFAULT_HUD_CAMERA_Z;
    const offsetZ = mode?.offsets?.current?.[2] ?? 0;
    const cameraOffsetDeg = Math.atan2(
      baseZ + offsetZ - this.dependencies.cameraModule?.DEFAULT_HUD_CAMERA_Z,
      F18HudModule.CAMERA_TO_HUD_DISTANCE_M
    ) * F18HudModule.RAD_TO_DEG;
    return {
      pixelsPerDeg,
      pixelsPerDegX,
      cameraOffsetPx: cameraOffsetDeg * pixelsPerDeg * F18HudModule.HUD_PARALLAX_GAIN
    };
  }

  updateLegacyFpvState(lla, ac) {
    if (!Array.isArray(lla) || !F18HudModule.isFiniteVector(lla)) return;
    const fpvState = this.fpvState;
    const [lat, lon, alt] = lla;
    if (fpvState.lastLat != null && fpvState.lastLon != null && fpvState.lastAlt != null) {
      const latRad = lat * Math.PI / 180;
      const dNorth = (lat - fpvState.lastLat) * 111320;
      const dEast = (lon - fpvState.lastLon) * (111320 * Math.cos(latRad));
      const dUp = alt - fpvState.lastAlt;
      const horizontal = Math.hypot(dNorth, dEast);
      if (horizontal > 0.01 || Math.abs(dUp) > 0.01) {
        let trackDeg = Math.atan2(dEast, dNorth) * F18HudModule.RAD_TO_DEG;
        if (trackDeg < 0) trackDeg += 360;
        const fpaDeg = Math.atan2(dUp, Math.max(horizontal, 1e-6)) * F18HudModule.RAD_TO_DEG;
        const heading = window.geofs?.animation?.values?.heading360
          ?? window.geofs?.animation?.values?.heading
          ?? ac.htr?.[0]
          ?? 0;
        fpvState.relAzDeg = this.dependencies.helperModule?.angleDiffDeg?.(heading, trackDeg) ?? 0;
        fpvState.relElDeg = fpaDeg - (-(ac.htr?.[1] || 0));
        fpvState.valid = true;
      }
    }
    fpvState.lastLat = lat;
    fpvState.lastLon = lon;
    fpvState.lastAlt = alt;
  }

  computeLegacyFpvScreenPosition(camera, cx, symbolCy, pixelsPerDeg, pixelsPerDegX) {
    if (!this.fpvState.valid) return null;
    const dxBody = -(this.fpvState.relAzDeg * pixelsPerDegX);
    const dyBody = -(this.fpvState.relElDeg * pixelsPerDeg);
    const cosine = Math.cos(-camera.roll);
    const sine = Math.sin(-camera.roll);
    return {
      x: cx + (dxBody * cosine - dyBody * sine),
      y: symbolCy + (dxBody * sine + dyBody * cosine)
    };
  }

  renderLegacyAttitude(ctx, camera, ac, hudLevel, helperModule, w, h, aoa) {
    const cx = w / 2;
    const clipCy = h / 2;
    const { pixelsPerDeg, pixelsPerDegX, cameraOffsetPx } = this.getLegacyHudGeometry(w, h);
    const symbolCy = clipCy - cameraOffsetPx;
    this.updateLegacyFpvState(ac.llaLocation, ac);
    if (hudLevel === 'FULL') {
      F18HudModule.drawLegacyBoresight(ctx, cx, symbolCy, pixelsPerDeg, w, h);
    }
    F18HudModule.drawLegacyPitchLadder(ctx, camera, ac, cx, clipCy, symbolCy, pixelsPerDeg, w, h);
    const fpvPos = this.computeLegacyFpvScreenPosition(camera, cx, symbolCy, pixelsPerDeg, pixelsPerDegX);

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, clipCy, w * 0.28, h * 0.38, 0, 0, Math.PI * 2);
    ctx.clip();
    const fpvDrawn = F18HudModule.drawFpv(ctx, fpvPos, w, h);
    if (hudLevel !== 'MIN') {
      F18HudModule.drawIlsDeviationCues(ctx, fpvDrawn, helperModule, w, h);
    }
    ctx.restore();

    const isGearDown = window.controls?.gear?.position < 0.5;
    F18HudModule.drawLegacyAoaBracket(
      ctx,
      fpvDrawn,
      cx,
      clipCy,
      pixelsPerDeg,
      w,
      h,
      aoa,
      isGearDown
    );
  }

  static drawAoaText(ctx, w, h, aoa) {
  const previousAlign = ctx.textAlign;
  const previousBaseline = ctx.textBaseline;
  ctx.fillStyle = this.DEFAULT_COLOR;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`α ${aoa.toFixed(1)}`, w * 0.716, h * 0.93);
  ctx.textAlign = previousAlign;
  ctx.textBaseline = previousBaseline;

  }

  static drawBoresight(ctx, boresightPoint, w, h) {
    if (!boresightPoint) return;
    ctx.save();
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.1;
    ctx.setLineDash([]);

    const wx = boresightPoint.x;
    const wy = boresightPoint.y;
    const ww = w * 0.027;
    const wh = h * 0.016;
    const stub = w * 0.010;

    ctx.beginPath();
    ctx.moveTo(wx - ww, wy);
    ctx.lineTo(wx - ww * 0.55, wy + wh);
    ctx.lineTo(wx, wy - wh * 0.15);
    ctx.lineTo(wx + ww * 0.55, wy + wh);
    ctx.lineTo(wx + ww, wy);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(wx - ww - stub, wy);
    ctx.lineTo(wx - ww, wy);
    ctx.moveTo(wx + ww, wy);
    ctx.lineTo(wx + ww + stub, wy);
    ctx.stroke();
    ctx.restore();
  }

  static getFpvAttitudeGeometry(anim, ac, width, height) {
    const aircraftPitchDeg = -Number(anim.atilt ?? ac.htr?.[1] ?? 0);
    const aircraftRollDeg = Number(anim.aroll ?? ac.htr?.[2] ?? 0);
    const pixelsPerDeg = this.getLegacyPixelsPerDegree(height);
    const hudPhysicalWidthM = this.HUD_PHYSICAL_HEIGHT_M * (width / height);
    const hudHorizontalFovDeg = 2 * Math.atan(
      (hudPhysicalWidthM / 2) / this.CAMERA_TO_HUD_DISTANCE_M
    ) * this.RAD_TO_DEG;
    const pixelsPerDegX = width / hudHorizontalFovDeg;
    const centerX = width / 2;
    const centerY = height / 2;
    const rollRad = aircraftRollDeg * this.DEG_TO_RAD;
    const horizonOffsetY = aircraftPitchDeg * pixelsPerDeg;
    const projectAngularOffset = (trackOffsetDeg, flightPathAngleDeg) => {
      const localX = trackOffsetDeg * pixelsPerDegX;
      const localY = horizonOffsetY - flightPathAngleDeg * pixelsPerDeg;
      return {
        x: centerX + Math.cos(rollRad) * localX - Math.sin(rollRad) * localY,
        y: centerY + Math.sin(rollRad) * localX + Math.cos(rollRad) * localY
      };
    };

    return {
      centerX,
      centerY,
      rollRad,
      horizonOffsetY,
      pixelsPerDeg,
      pixelsPerDegX,
      projectAngularOffset,
      horizonCenter: projectAngularOffset(0, 0),
      pitch0: projectAngularOffset(0, 0),
      pitch5: projectAngularOffset(0, 5),
      pitch10: projectAngularOffset(0, 10),
      pitchMinus5: projectAngularOffset(0, -5),
      pitchMinus10: projectAngularOffset(0, -10)
    };
  }

  static createWorldAttitudeBasis(frame) {
    const horizontalForward = this.normalizeVector(this.subtractVectors(
      frame.boresightDirection,
      this.scaleVector(frame.earthUp, this.dotProduct(frame.boresightDirection, frame.earthUp))
    ));
    const lateral = horizontalForward
      ? this.normalizeVector(this.crossProduct(horizontalForward, frame.earthUp))
      : null;
    return horizontalForward && lateral
      ? { forward: horizontalForward, lateral }
      : null;
  }

  static getFlightPathAttitudePosition(frame, attitudeGeometry) {
    if (!frame.fpvFlightPathDirection || !frame.boresightDirection || !frame.earthUp) return null;

    const attitudeBasis = this.createWorldAttitudeBasis(frame);
    if (!attitudeBasis) return null;

    const upComponent = Math.max(
      -1,
      Math.min(1, this.dotProduct(frame.fpvFlightPathDirection, frame.earthUp))
    );
    const flightPathAngleDeg = Math.asin(upComponent) * this.RAD_TO_DEG;
    const trackOffsetDeg = Math.atan2(
      this.dotProduct(frame.fpvFlightPathDirection, attitudeBasis.lateral),
      this.dotProduct(frame.fpvFlightPathDirection, attitudeBasis.forward)
    ) * this.RAD_TO_DEG;

    return {
      flightPathAngleDeg,
      trackOffsetDeg,
      position: attitudeGeometry.projectAngularOffset(trackOffsetDeg, flightPathAngleDeg)
    };
  }

  static applyCombinerClip(ctx, frame) {
    const [first, ...rest] = frame.outline;
    if (!first) return false;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const point of rest) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    ctx.clip();
    return true;
  }

  static drawDebugMarker(ctx, point, color, label) {
    if (!point) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(point.x - 6, point.y);
    ctx.lineTo(point.x + 6, point.y);
    ctx.moveTo(point.x, point.y - 6);
    ctx.lineTo(point.x, point.y + 6);
    ctx.stroke();
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, point.x + 7, point.y - 7);
    ctx.restore();
  }

  static drawHudDebugMarkers(ctx, debugData) {
    this.drawDebugMarker(ctx, debugData.boresightPosition, '#ff3333', 'B');
    this.drawDebugMarker(ctx, debugData.fpvPosition, '#00ff00', 'F');
    this.drawDebugMarker(ctx, debugData.horizonCenter, '#3399ff', 'H');
    this.drawDebugMarker(ctx, debugData.ladderZeroCenter, '#ffff00', '0');
  }

  static drawAttitudePitchLadder(ctx, geometry, w, h) {
    ctx.save();
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.fillStyle = this.DEFAULT_COLOR;
    ctx.font = `${Math.round(h * 0.038)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;
    ctx.translate(geometry.centerX, geometry.centerY);
    ctx.rotate(geometry.rollRad);
    ctx.translate(0, geometry.horizonOffsetY);

    ctx.beginPath();
    ctx.moveTo(-w * 0.56, 0);
    ctx.lineTo(w * 0.56, 0);
    ctx.stroke();

    for (let degree = 5; degree <= this.LADDER_TICK_RANGE_DEG; degree += 5) {
      for (const tickY of [-degree * geometry.pixelsPerDeg, degree * geometry.pixelsPerDeg]) {
        const isBelowHorizon = tickY > 0;
        const tickDirection = isBelowHorizon ? -1 : 1;
        ctx.setLineDash(isBelowHorizon ? [6, 4] : []);
        ctx.beginPath();
        ctx.moveTo(-w * 0.14, tickY);
        ctx.lineTo(-w * 0.025, tickY);
        ctx.moveTo(w * 0.025, tickY);
        ctx.lineTo(w * 0.14, tickY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(-w * 0.14, tickY);
        ctx.lineTo(-w * 0.14, tickY + tickDirection * h * 0.03);
        ctx.moveTo(w * 0.14, tickY);
        ctx.lineTo(w * 0.14, tickY + tickDirection * h * 0.03);
        ctx.stroke();
        ctx.fillText(String(degree), -w * 0.165 - 3, isBelowHorizon ? tickY - 7 : tickY + 7);
        ctx.fillText(String(degree), w * 0.165 + 3, isBelowHorizon ? tickY - 7 : tickY + 7);
      }
    }
    ctx.restore();
  }

  static drawFpv(ctx, fpvPos, w, h) {
    if (!fpvPos) return null;
    const fpvX = fpvPos.x;
    const fpvY = fpvPos.y;

    ctx.save();
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([]);

    const r = w * 0.012;
    const wing = w * 0.024;
    const tail = h * 0.024;

    ctx.beginPath();
    ctx.arc(fpvX, fpvY, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(fpvX - r - wing, fpvY);
    ctx.lineTo(fpvX - r, fpvY);
    ctx.moveTo(fpvX + r, fpvY);
    ctx.lineTo(fpvX + r + wing, fpvY);
    ctx.moveTo(fpvX, fpvY - r);
    ctx.lineTo(fpvX, fpvY - r - tail);
    ctx.stroke();
    ctx.restore();

    return { x: fpvX, y: fpvY, r, wing };
  }

  static drawAoaBracket(ctx, fpvDrawn, w, h, aoa, isGearDown) {
    if (!isGearDown || !fpvDrawn || !Number.isFinite(aoa)) return;

    const AOA_TOP = 6.9;
    const AOA_STEP = 1.2;
    const tickSpacing = h * 0.03;
    const index = (aoa - AOA_TOP) / AOA_STEP;
    const topY = fpvDrawn.y - index * tickSpacing;
    const midY = topY + tickSpacing;
    const bottomY = topY + 2 * tickSpacing;
    const bracketX = fpvDrawn.x - fpvDrawn.r - fpvDrawn.wing - w * 0.022;
    const tickLen = w * 0.018;

    ctx.save();
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(bracketX, topY);
    ctx.lineTo(bracketX, bottomY);
    ctx.moveTo(bracketX, topY);
    ctx.lineTo(bracketX + tickLen, topY);
    ctx.moveTo(bracketX, midY);
    ctx.lineTo(bracketX + tickLen, midY);
    ctx.moveTo(bracketX, bottomY);
    ctx.lineTo(bracketX + tickLen, bottomY);
    ctx.stroke();
    ctx.restore();
  }

  static drawLegacyBoresight(ctx, cx, symbolCy, pixelsPerDeg, w, h) {
    const point = { x: cx, y: symbolCy - 1.5 * pixelsPerDeg };
    this.drawBoresight(ctx, point, w, h);
  }

  static drawLegacyPitchLadder(ctx, camera, ac, cx, clipCy, symbolCy, pixelsPerDeg, w, h) {
    const pitchDeg = -ac.htr[1] || 0;
    const geometry = {
      centerX: cx,
      centerY: clipCy,
      rollRad: -camera.roll,
      horizonOffsetY: pitchDeg * pixelsPerDeg + (symbolCy - clipCy),
      pixelsPerDeg
    };
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(w * 0.34, h * 0.06);
    ctx.lineTo(w * 0.66, h * 0.06);
    ctx.lineTo(w * 0.92, h * 0.27);
    ctx.lineTo(w * 0.82, h * 0.92);
    ctx.lineTo(w * 0.18, h * 0.92);
    ctx.lineTo(w * 0.08, h * 0.27);
    ctx.closePath();
    ctx.clip();
    this.drawAttitudePitchLadder(ctx, geometry, w, h);
    ctx.restore();
  }

  static drawLegacyAoaBracket(ctx, fpvDrawn, cx, clipCy, pixelsPerDeg, w, h, aoa, isGearDown) {
    if (!isGearDown || !fpvDrawn || !Number.isFinite(aoa)) return;
    const aoaTop = 6.9;
    const aoaStep = 1.2;
    const tickSpacing = aoaStep * pixelsPerDeg;
    const topY = fpvDrawn.y - ((aoa - aoaTop) / aoaStep) * tickSpacing;
    const midY = topY + tickSpacing;
    const bottomY = topY + 2 * tickSpacing;
    const bracketX = fpvDrawn.x - fpvDrawn.r - fpvDrawn.wing - w * 0.022;
    const tickLength = w * 0.018;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, clipCy, w * 0.28, h * 0.38, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(bracketX, topY);
    ctx.lineTo(bracketX, bottomY);
    ctx.moveTo(bracketX, topY);
    ctx.lineTo(bracketX + tickLength, topY);
    ctx.moveTo(bracketX, midY);
    ctx.lineTo(bracketX + tickLength, midY);
    ctx.moveTo(bracketX, bottomY);
    ctx.lineTo(bracketX + tickLength, bottomY);
    ctx.stroke();
    ctx.restore();
  }

  static drawSpeedBox(ctx, kias, w, h) {
  const boxX = w * 0.145;
  const boxY = h * 0.295;
  const boxW = w * 0.118;
  const boxH = h * 0.064;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = this.DEFAULT_COLOR;
  ctx.lineWidth = Math.max(1.2, w * 0.0028);
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = this.DEFAULT_COLOR;
  ctx.font = `bold ${Math.round(h * 0.042)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(kias)}`, boxX + boxW / 2, boxY + boxH / 2 + 1);
  ctx.restore();
  }

  static drawAltitudeBox(ctx, alt, w, h) {
  const boxX = w * 0.730;
  const boxY = h * 0.295;
  const boxW = w * 0.138;
  const boxH = h * 0.064;

  const altRounded = Math.max(0, Math.round(alt));
  const thousands = Math.floor(altRounded / 1000);
  const hundreds = altRounded % 1000;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = this.DEFAULT_COLOR;
  ctx.lineWidth = Math.max(1.2, w * 0.0028);
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  const rightX = boxX + boxW - w * 0.012;
  const centerY = boxY + boxH / 2 + 1;
  const smallText = String(hundreds).padStart(3, '0');

  ctx.fillStyle = this.DEFAULT_COLOR;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  ctx.font = `bold ${Math.round(h * 0.034)}px monospace`;
  const smallWidth = ctx.measureText(smallText).width;
  ctx.fillText(smallText, rightX, centerY);

  ctx.font = `bold ${Math.round(h * 0.046)}px monospace`;
  ctx.fillText(String(thousands), rightX - smallWidth - w * 0.006, centerY);
  ctx.restore();
  }

  static drawLeftReadouts(ctx, mach, gValue, aoa, maxGValue, autopilot, w, h) {
  const x = w * 0.145;
  const y1 = h * 0.405;
  const y2 = h * 0.457;
  const y3 = h * 0.509;
  const y4 = h * 0.561;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = this.DEFAULT_COLOR;
  ctx.font = `${Math.round(h * 0.036)}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const gPrefix = 'G ';
  const gPrefixWidth = ctx.measureText(gPrefix).width;

  ctx.fillText(`M ${mach.toFixed(2)}`, x, y1);
  ctx.fillText(`α ${aoa.toFixed(1)}`, x, y2);
  ctx.fillText(gPrefix, x, y3);
  ctx.fillText(gValue.toFixed(1), x + gPrefixWidth, y3);
  // Max G zonder prefix, uitgelijnd op het G-getal.
  ctx.fillText(maxGValue.toFixed(1), x + gPrefixWidth, y4);

  if (autopilot?.on) {
    const sepY = h * 0.596;
    ctx.beginPath();
    ctx.moveTo(x, sepY);
    ctx.lineTo(w * 0.265, sepY);
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const rowStep = h * 0.046;
    let rowY = sepY + h * 0.038;
    ctx.font = `${Math.round(h * 0.032)}px monospace`;

    if (autopilot?.values?.speed != null) {
      ctx.fillText(`SPD ${Math.round(autopilot.values.speed)}`, x, rowY);
      rowY += rowStep;
    }

    if (autopilot?.values?.altitude != null) {
      const altitudeText = String(autopilot.values.altitude).split('.')[0];
      ctx.fillText(`ALT ${altitudeText}`, x, rowY);
      rowY += rowStep;
    }

    if (autopilot?.mode) {
      ctx.fillText(String(autopilot.mode), x, rowY);
    }
  }

  ctx.restore();
  }

  static drawRightReadouts(ctx, vsi, radioAlt, trimDisplay, navUnit, navModule, w, h, wpnHudStatus) {
  const x = w * 0.730;
  const yTop = h * 0.260;
  const yBottom = h * 0.405;
  const yTrim = h * 0.457;
  const yWpn1 = h * 0.509;
  const yWpn2 = h * 0.561;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = this.DEFAULT_COLOR;
  ctx.font = `${Math.round(h * 0.036)}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(` ${vsi >= 0 ? ' ' : ''}${vsi}`, x, yTop);

  if (radioAlt <= 10000) {
    ctx.fillText(`R ${Math.round(radioAlt)}`, x, yBottom);
  }

  ctx.fillText(trimDisplay, x, yTrim);

  if (wpnHudStatus) {
    ctx.fillText(wpnHudStatus.line1, x, yWpn1);
    ctx.fillText(wpnHudStatus.line2, x, yWpn2);
  }

  if (navUnit != null) {
    const navReadouts = navModule?.getReadouts?.(navUnit) ?? {};
    const sepY = h * 0.596;
    ctx.beginPath();
    ctx.moveTo(x, sepY);
    ctx.lineTo(w * 0.85, sepY);
    ctx.strokeStyle = this.DEFAULT_COLOR;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const rowStep = h * 0.046;
    let rowY = sepY + h * 0.038;
    ctx.font = `${Math.round(h * 0.032)}px monospace`;

    const dme = Number.isFinite(navReadouts.dme) ? navReadouts.dme : '';
    const bearing = Number.isFinite(navReadouts.bearing) ? navReadouts.bearing : '';
    const course = Number.isFinite(navReadouts.course) ? navReadouts.course : '';
    const timeToSignal = Number.isFinite(navReadouts.timeToSignal) ? navReadouts.timeToSignal : '';

    ctx.fillText(`DME ${dme}`, x, rowY);
    rowY += rowStep;
    ctx.fillText(`B ${bearing}`, x, rowY);
    rowY += rowStep;
    ctx.fillText(`C ${course}`, x, rowY);
    rowY += rowStep;
    ctx.fillText(`T ${timeToSignal} MIN`, x, rowY);
    rowY += rowStep;

    ctx.fillText(navReadouts.navaidLabel || '', x, rowY);
  }

  ctx.restore();
  }

  static drawTopHeadingScale(ctx, renderer, hdg, navUnit, helperModule, w, h) {
  const bandX = w * 0.275;
  const bandY = h * 0.078;
  const bandW = w * 0.450;
  const bandH = h * 0.108;

  ctx.save();
  ctx.beginPath();
  ctx.rect(bandX, bandY, bandW, bandH);
  ctx.clip();
  ctx.textAlign = 'center';
  const prevFont = ctx.font;
  ctx.font = `${Math.round(h * 0.030)}px monospace`;

  renderer.drawGrads(renderer.canvasAPI, {
    position: [bandX, bandY + h * 0.030],
    zero: [bandW / 2, 0],
    size: [bandW, bandH],
    orientation: 'x',
    direction: 1,
    value: hdg,
    interval: 5,
    pixelRatio: w * 0.0105,
    pattern: [[{
      length: h * 0.016,
      legend: true,
      legendOffset: { x: 0, y: -h * 0.004 },
      process: v => {
        const deg = ((Math.round(v / 10) * 10) % 360 + 360) % 360;
        return String(deg);
      }
    }], [{
      length: h * 0.009
    }]]
  });
  ctx.font = prevFont;
  ctx.restore();

  // Center caret / inverted V marker.
  const cx = w / 2;
  const topY = bandY + bandH - h * 0.043;
  const halfW = w * 0.012;
  const height = h * 0.016;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = this.DEFAULT_COLOR;
  ctx.lineWidth = Math.max(1.2, w * 0.0026);
  ctx.beginPath();
  ctx.moveTo(cx - halfW, topY);
  ctx.lineTo(cx, topY - height);
  ctx.lineTo(cx + halfW, topY);
  ctx.stroke();

  // Bearing diamond marker in heading tape.
  if (navUnit != null && Number.isFinite(navUnit?.bearing)) {
    const bearingDeltaDeg = helperModule?.angleDiffDeg?.(navUnit.bearing, hdg) ?? 0;
    const pxPerDeg = (w * 0.0105) / 5;
    const diamondX = cx + bearingDeltaDeg * pxPerDeg;
    const bandLeft = bandX;
    const bandRight = bandX + bandW;

    if (diamondX >= bandLeft && diamondX <= bandRight) {
      const diamondTopY = topY - height;
      const diamondHalfW = w * 0.007;
      const diamondHalfH = h * 0.010;

      ctx.fillStyle = this.DEFAULT_COLOR;
      ctx.beginPath();
      ctx.moveTo(diamondX, diamondTopY);
      ctx.lineTo(diamondX + diamondHalfW, diamondTopY + diamondHalfH);
      ctx.lineTo(diamondX, diamondTopY + diamondHalfH * 2);
      ctx.lineTo(diamondX - diamondHalfW, diamondTopY + diamondHalfH);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();

  }

  static drawIlsDeviationCues(ctx, fpvDrawn, helperModule, w, h) {
  const navUnit = window.geofs?.nav?.currentNAVUnit;
  if (!navUnit || !fpvDrawn) return;

  const navDirection = window.geofs?.animation?.getValue?.('NAVDirection')
    ?? window.geofs?.animation?.values?.NAVDirection
    ?? navUnit?.NAVDirection;

  const outOfRange = navUnit?.inRange === false;
  const isFrom = navUnit === 'from' || navDirection === 'from';

  if (outOfRange || isFrom) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.DEFAULT_COLOR;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `${Math.round(h * 0.033)}px monospace`;
    ctx.fillText(outOfRange ? 'OUT OF RANGE' : 'FROM', fpvDrawn.x, fpvDrawn.y + h * 0.032);
    ctx.restore();
    return;
  }

  const getValue = window.geofs?.animation?.getValue?.bind(window.geofs?.animation);
  const navCourseDeviation = getValue
    ? (getValue('NAVCourseDeviation') ?? 0)
    : (window.geofs?.animation?.values?.NAVCourseDeviation ?? 0);
  const navGlideDeviation = getValue
    ? (getValue('NAVGlideAngleDeviation') ?? 0)
    : (window.geofs?.animation?.values?.NAVGlideAngleDeviation ?? 0);

  // Scale originele HUD offsets naar huidige canvasafmetingen.
  const courseOffsetPx = (helperModule?.clampValue?.(10 * navCourseDeviation, -75, 75) ?? 0) * (w / 512);
  const glideOffsetPx = (helperModule?.clampValue?.(-10 * navGlideDeviation, -75, 75) ?? 0) * (h / 512);

  const fpvX = fpvDrawn.x;
  const fpvY = fpvDrawn.y;
  const hLen = w * 0.055;
  const vLen = h * 0.055;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = this.DEFAULT_COLOR;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([]);

  // Glide slope: horizontale streep (alleen bij VNAV-capable).
  if (navUnit?.VNAVCapable) {
    const glideY = fpvY + glideOffsetPx;
    ctx.beginPath();
    // Horizontaal gecentreerd op FPV, alleen verticale offset.
    ctx.moveTo(fpvX - hLen, glideY);
    ctx.lineTo(fpvX + hLen, glideY);
    ctx.stroke();
  }

  // Course deviation: verticale streep (alleen bij LNAV-capable).
  if (navUnit?.LNAVCapable) {
    const courseX = fpvX + courseOffsetPx;
    ctx.beginPath();
    // Verticaal gecentreerd op FPV, alleen horizontale offset.
    ctx.moveTo(courseX, fpvY - vLen);
    ctx.lineTo(courseX, fpvY + vLen);
    ctx.stroke();
  }

  ctx.restore();

  }

  static drawGearAndFlapIndicators(ctx, w, h, lineColor, options = {}) {
  const target = String(options?.target ?? 'hud').toLowerCase();
  const isMfd = target === 'mfd';

  const gearRaw = Number(window.controls?.gear?.position);
  const gearPos = Number.isFinite(gearRaw) ? gearRaw : 1;

  const flapsPosRaw = Number(window.controls?.flaps?.position);
  const flapsPos = Number.isFinite(flapsPosRaw) ? flapsPosRaw : 0;
  const flapsMaxRaw = Number(window.controls?.flaps?.maxPosition);
  const flapsMax = Number.isFinite(flapsMaxRaw) && flapsMaxRaw > 0 ? flapsMaxRaw : 1;
  const flapsNorm = Math.max(0, Math.min(1, flapsPos / flapsMax));

  const hookRaw = Number(window.controls?.accessories?.position);
  const hookPos = Number.isFinite(hookRaw) ? Math.max(0, Math.min(1, hookRaw)) : 0;

  const top = isMfd ? h * 0.27 : h * 0.02;

  // Keep the 3 indicators centered, but make the total footprint narrower.
  const clusterCenterX = w * 0.5;
  const clusterW = isMfd ? w * 0.58 : w * 0.50;
  const gapGearToFlap = clusterW * (isMfd ? 0.07 : 0.06);
  const gapFlapToHook = clusterW * (isMfd ? 0.045 : 0.035); // hook closer to flap
  const blockW = (clusterW - gapGearToFlap - gapFlapToHook) / 3;
  const left = clusterCenterX - (clusterW * 0.5);

  const indicatorTopY = top;
  const indicatorBottomY = top + (isMfd ? h * 0.12 : h * 0.14);
  const textY = top + (isMfd ? h * 0.17 : h * 0.19);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = lineColor;
  ctx.fillStyle = lineColor;
  ctx.lineWidth = Math.max(1.5, w * 0.0025);
  ctx.setLineDash([]);

  const flapsLineWidth = isMfd ? 5 : 3;
  const hookLineWidth = isMfd ? 5 : 3;
  const dotRadius = isMfd ? 2.5 : Math.max(1.5, w * 0.0028);

  // --- GEAR indicator (3 boxes) ---
  const gearX = left;
  const boxW = blockW * (isMfd ? 0.13 : 0.11);
  const boxH = h * (isMfd ? 0.042 : 0.10);
  const topBoxX = gearX + blockW * 0.445;
  const topBoxY = indicatorTopY - (isMfd ? boxH * 0.80 : 0);
  const leftBoxX = gearX + blockW * 0.20;
  const leftBoxY = indicatorBottomY - boxH;
  const rightBoxX = gearX + blockW * 0.70;
  const rightBoxY = indicatorBottomY - boxH;

  const isGearDown = gearPos <= 0;
  const isGearUp = gearPos >= 1;
  const isGearTrans = !isGearDown && !isGearUp;
  const gearFill = isGearDown ? '#00ff00' : isGearTrans ? '#ff8a24' : null;

  const drawGearBox = (x, y) => {
    ctx.strokeRect(x, y, boxW, boxH);
    if (gearFill) {
      ctx.fillStyle = gearFill;
      ctx.fillRect(x + 1, y + 1, Math.max(0, boxW - 2), Math.max(0, boxH - 2));
      ctx.fillStyle = lineColor;
    }
  };

  drawGearBox(topBoxX, topBoxY);
  drawGearBox(leftBoxX, leftBoxY);
  drawGearBox(rightBoxX, rightBoxY);

  let gearStatus = 'GEAR UP';
  if (isGearDown) gearStatus = 'GEAR DOWN';
  else if (isGearTrans) gearStatus = 'GEAR TRANS';

  // --- FLAP indicator ---
  const flapX = gearX + blockW + gapGearToFlap;
  const flapWingY = top + (isMfd ? h * 0.03 : h * 0.045);
  const wingStartX = flapX + blockW * 0.08;
  const wingEndX = flapX + blockW * 0.62;
  const flapHingeX = wingEndX;
  const slatHingeX = wingStartX;
  const segmentLen = blockW * (isMfd ? 0.40 : 0.22);

  const flapMaxDeg = 45;
  const flapDeg = flapMaxDeg * flapsNorm;
  const flapRad = flapDeg * Math.PI / 180;
  const slatNorm = Math.max(0, Math.min(1, flapsPos));
  const slatMaxDeg = 30;

  // wing baseline
  const previousLineWidth = ctx.lineWidth;
  ctx.lineWidth = flapsLineWidth;
  ctx.beginPath();
  ctx.moveTo(wingStartX, flapWingY);
  ctx.lineTo(wingEndX, flapWingY);
  ctx.stroke();

  // slat line: continuous exact angle; position 1 is max deflection
  const slatDeg = slatMaxDeg * slatNorm;
  const slatRad = slatDeg * Math.PI / 180;
  const slatEndX = slatHingeX - Math.cos(slatRad) * (segmentLen * 0.55);
  const slatEndY = flapWingY + Math.sin(slatRad) * (segmentLen * 0.55);
  ctx.beginPath();
  ctx.moveTo(slatHingeX, flapWingY);
  ctx.lineTo(slatEndX, slatEndY);
  ctx.stroke();

  // flap line (continuous exact angle)
  const flapEndX = flapHingeX + Math.cos(flapRad) * segmentLen;
  const flapEndY = flapWingY + Math.sin(flapRad) * segmentLen;
  ctx.beginPath();
  ctx.moveTo(flapHingeX, flapWingY);
  ctx.lineTo(flapEndX, flapEndY);
  ctx.stroke();
  ctx.lineWidth = previousLineWidth;

  // detent dots: 0..maxPosition
  const detentCount = Math.max(1, Math.round(flapsMax));
  for (let i = 0; i <= detentCount; i++) {
    const t = i / detentCount;
    const a = (flapMaxDeg * t) * Math.PI / 180;
    const dx = Math.cos(a) * segmentLen;
    const dy = Math.sin(a) * segmentLen;
    const dotX = flapHingeX + dx;
    const dotY = flapWingY + dy;
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  let flapStatus = 'FLAPS UP';
  if (flapsPos >= flapsMax) {
    flapStatus = 'FLAPS DOWN';
  } else if (flapsPos > 0) {
    const nearest = Math.max(1, Math.min(detentCount - 1, Math.round(flapsPos)));
    flapStatus = `FLAPS ${nearest} / ${detentCount}`;
  }

  // --- HOOK indicator ---
  const hookX = flapX + blockW + gapFlapToHook;
  const hookWingY = flapWingY;
  const hookHingeX = hookX + blockW * 0.38;
  const hookLen = blockW * (isMfd ? 0.36 : 0.24);
  const hookRad = (45 * hookPos) * Math.PI / 180;

  const hookUpX = hookHingeX + hookLen;
  const hookUpY = hookWingY;
  const hookDownX = hookHingeX + Math.cos(Math.PI / 4) * hookLen;
  const hookDownY = hookWingY + Math.sin(Math.PI / 4) * hookLen;

  ctx.lineWidth = hookLineWidth;
  const hookEndX = hookHingeX + Math.cos(hookRad) * hookLen;
  const hookEndY = hookWingY + Math.sin(hookRad) * hookLen;
  ctx.beginPath();
  ctx.moveTo(hookHingeX, hookWingY);
  ctx.lineTo(hookEndX, hookEndY);
  ctx.stroke();
  ctx.lineWidth = previousLineWidth;

  ctx.beginPath();
  ctx.arc(hookUpX, hookUpY, dotRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(hookDownX, hookDownY, dotRadius, 0, Math.PI * 2);
  ctx.fill();

  let hookStatus = 'HOOK UP';
  if (hookPos >= 1) {
    hookStatus = 'HOOK DOWN';
  } else if (hookPos > 0) {
    hookStatus = 'HOOK MOV';
  }

  // status labels on equal baseline
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(h * (isMfd ? 0.036 : 0.048))}px monospace`;

  const gearCenterX = gearX + blockW * 0.5;
  const flapCenterX = flapX + blockW * 0.5;
  const hookCenterX = hookX + blockW * 0.5;

  ctx.fillStyle = isGearTrans ? '#ff8a24' : lineColor;
  ctx.fillText(gearStatus, gearCenterX, textY);

  ctx.fillStyle = lineColor;
  ctx.fillText(flapStatus, flapCenterX, textY);
  ctx.fillText(hookStatus, hookCenterX, textY);

  ctx.restore();

  }

  renderF18Hud(renderer) {
  const o = renderer.canvasAPI.context;
  const canvas = renderer.canvasAPI.canvas ?? o.canvas;
  const w = canvas?.width || 512;
  const h = canvas?.height || 512;

  const ac = window.geofs?.aircraft?.instance;
  const camera = window.geofs?.api?.viewer?.camera;
  const anim = window.geofs?.animation?.values ?? {};

  const kias = window.exponentialSmoothing
    ? window.exponentialSmoothing('smoothKias', anim.kias ?? 0, 0.1)
    : (anim.kias ?? 0);
  const alt = anim.altitude ?? 0;
  const hdg = anim.heading360 ?? anim.heading ?? 0;
  const aoa = anim.aoa ?? 0;
  const mach = Math.round(((window.geofs?.animation?.values?.mach ?? 0) * 100)) / 100;
  const vsi = Math.round((window.geofs?.animation?.values?.climbrate ?? 0) / 10) * 10;
  const radioAlt = window.geofs?.animation?.values?.haglFeet ?? 0;
  const trimScaled = Math.round((window.geofs?.animation?.values?.trim ?? 0) * 100);
  const trimDisplay = trimScaled === 0 ? 'T T/O' : `T ${trimScaled}`;
  const currentG = Number.isFinite(anim.loadFactor) ? anim.loadFactor : 1;
  const navUnit = window.geofs?.nav?.currentNAVUnit ?? null;
  const autopilot = window.geofs?.autopilot ?? null;
  const wpnMaster = this.getOption('WPN', 'MASTER', 'OFF');
  const wpnMode = this.getWpnModeFromOptions();
  const wpnModeLoadout = this.getWpnModeLoadout(wpnMode);
  const wpnHudStatus = wpnMaster !== 'OFF'
    ? {
        line1: `${wpnMaster === 'SIM' ? 'SIM' : 'ARM'} ${wpnMode}`,
        line2: this.getSelectedWpnQuantityLine(wpnMode, wpnModeLoadout)
      }
    : null;
  const hudBaseColor = this.getOptionValue('HUD', 'COLOR', F18HudModule.DEFAULT_COLOR);
  const hudColor = this.applyBrightnessToHexColor(hudBaseColor, this.getMfdBrightnessFactor());
  const hudLevel = this.getOption('HUD', 'LEVEL', 'FULL');
  F18HudModule.DEFAULT_COLOR = hudColor;

  this.updateWpnRearmState();

  if (currentG > this.maxG) {
    this.maxG = currentG;
  }

  const helperModule = this.dependencies.helperModule;
  const navModule = this.getNavModule();

  // Canvas leeg maken met echte transparantie (voorkomt volle groene plaat).
  o.save();
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.clearRect(0, 0, w, h);
  o.restore();

  // Achtergrond overlay (GeoFS origineel gebruikt e.images.background; hier weglaten
  // want we willen een glazen HUD zonder achtergrond-sprite).

  o.fillStyle = hudColor;
  o.strokeStyle = hudColor;
  o.lineWidth = 2;
  o.font = `20px sans-serif`;

  // --- Kompasband bovenaan ---
  if (hudLevel == 'FULL') {
    F18HudModule.drawTopHeadingScale(o, renderer, hdg, navUnit, helperModule, w, h);
  }

  // --- Speed + Altitude boxed readouts (meer naar binnen) ---
  F18HudModule.drawSpeedBox(o, kias, w, h);
  F18HudModule.drawAltitudeBox(o, alt, w, h);

  // --- Readouts links/rechts rond de boxes ---
  if (hudLevel !== 'MIN') {
      F18HudModule.drawLeftReadouts(o, mach, currentG, aoa, this.maxG, autopilot, w, h);
    F18HudModule.drawRightReadouts(o, vsi, radioAlt, trimDisplay, navUnit, navModule, w, h, wpnHudStatus);
  }

  // --- Attitude symbology shares one camera/combiner projection snapshot. ---
  if (ac && this.dependencies.hudCombinerConfig) {
    const hudFrame = this.collectHudProjectionInputs(renderer, ac);
    if (hudFrame) {
      hudFrame.projectDirection = (direction) => this.projectWorldDirection(hudFrame, direction);
      const boresightPoint = hudFrame.projectDirection(hudFrame.boresightDirection);
      const attitudeGeometry = F18HudModule.getFpvAttitudeGeometry(anim, ac, w, h);
      const flightPathSymbol = F18HudModule.getFlightPathAttitudePosition(
        hudFrame,
        attitudeGeometry
      );
      const fpvPoint = flightPathSymbol?.position ?? null;
      const debugData = this.isHudProjectionDebug
        ? this.collectHudGeometryDebugData(
          hudFrame,
          attitudeGeometry,
          flightPathSymbol,
          anim,
          ac
        )
        : null;
      if (debugData) this.reportHudGeometryDiagnostics(debugData);

      o.save();
      o.setTransform(1, 0, 0, 1, 0, 0);
      if (F18HudModule.applyCombinerClip(o, hudFrame)) {
        if (hudLevel === 'FULL') {
          F18HudModule.drawBoresight(o, boresightPoint, w, h);
        }
        F18HudModule.drawAttitudePitchLadder(o, attitudeGeometry, w, h);

        const fpvDrawn = F18HudModule.drawFpv(o, fpvPoint, w, h);
        if (hudLevel !== 'MIN') {
          F18HudModule.drawIlsDeviationCues(o, fpvDrawn, helperModule, w, h);
        }
        const isGearDown = window.controls?.gear?.position < 0.5;
        F18HudModule.drawAoaBracket(o, fpvDrawn, w, h, aoa, isGearDown);
        if (debugData) {
          F18HudModule.drawHudDebugMarkers(o, debugData);
        }
      }
      o.restore();
    }
  } else if (camera && ac?.htr) {
    this.renderLegacyAttitude(o, camera, ac, hudLevel, helperModule, w, h, aoa);
  }

  if (this.isWpnFireFlashVisible()) {
    o.save();
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.fillStyle = F18HudModule.DEFAULT_COLOR;
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.font = `${Math.round(h * 0.15)}px monospace`;
    o.fillText(this.getWpnActionFlashLabel(), w * 0.5, h * 0.52);
    o.restore();
  }

  const communicationModule = this.getCommunicationModule();
  const commHudText = communicationModule?.getHudOverlayText?.();
  if (commHudText) {
    o.save();
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.fillStyle = F18HudModule.DEFAULT_COLOR;
    o.textAlign = 'center';
    o.textBaseline = 'bottom';
    o.font = `bold ${Math.round(h * 0.038)}px monospace`;
    const lines = String(commHudText ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
    const lineHeight = h * 0.045;
    const startY = h * 0.96 - ((lines.length - 1) * lineHeight);
    for (let i = 0; i < lines.length; i++) {
      o.fillText(lines[i], w * 0.5, startY + i * lineHeight);
    }
    o.restore();
  }

  }

}