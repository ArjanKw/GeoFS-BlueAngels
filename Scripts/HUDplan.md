# Plan: F18 HUD combinerprojectie

## TLDR
Alleen de attitude-HUD refactoren naar een fysieke world-space combinerprojectie; UI/readouts blijven onveranderd.

## Scope en beslissingen
- Alleen attitude-elementen worden herpositioneerd: horizon, pitch ladder, FPV, AoA, ILS en toekomstige attitude-elementen.
- Bestaande vaste tekst, readouts en UI-artwork behouden hun huidige layout en vorm.
- Configuratienummers zijn een verplichte kalibratievoorwaarde, geen vraag aan de gebruiker.
- Tijdens deze planning wordt geen repositorycode gewijzigd onder `C:\git\GeoFS-BlueAngels`.

## Fase 0 — Kalibratie
- Meet en valideer vóór codewijzigingen de authoritative `F18MainPlugin.HUD_COMBINER_CONFIG`: `origin`, `normal`, `right`, `up` en de rechthoekige outline in aircraft-local coördinaten.
- Gebruik een expliciete, gevalideerde configuratie; maak de implementatie niet afhankelijk van GLTF-node lookup of runtime-fallbacks.
- Laat de attitude-laag expliciet falen en log dit wanneer configuratie ontbreekt; de vaste HUD moet dan zichtbaar blijven.

## Fase 1 — Configuratie en inputs
- Injecteer de configuratie uit `C:\git\GeoFS-BlueAngels\Scripts\addon\aircrafts\F18MainPlugin.js` in `F18HudModule`.
- Voeg `collectHudProjectionInputs(renderer, ac)` toe aan `C:\git\GeoFS-BlueAngels\Scripts\addon\modules\F18HudModule.js` en roep deze precies eenmaal per frame aan.
- Leg een snapshot vast met Cesium camera, viewport en frustum, camera-/head-worldpositie, aircraft local-worldtransform, Earth up/zwaartekracht, eerst `airVelocity` en daarna `velocity`, plus world-space combiner en outline.
- Onderbouw de brongegevens in `C:\git\GeoFS-BlueAngels\Scripts\base\geofs.js`: `airVelocity=velocity-wind` op 17634–17641; lokale xyz-fysica via `xyz2lla` op 18579–18585; cockpitcamera-/headbeweging op 23777–23809; ENU op 11864–11870 en `xyz2lla` op 12048–12056; schermprojectie met `getScreenCoordFromLla` en `SceneTransforms` op 12044–12046. CesiumJS is versie 1.118.

## Fase 2 — Centrale projectiepijplijn
- Bouw een pure centrale pijplijn: snij een world-richting vanuit de actuele camera met de combiner en projecteer vervolgens naar de actuele viewport.
- Houd alle geometrie world-space en genormaliseerd ten opzichte van de combiner tot aan rasterisatie.
- Gebruik pixels uitsluitend voor styling: font, stroke, tick-, dash- en symboolafmetingen. Pixels zijn verboden voor positie, oriëntatie, horizon, ladder en FPV.
- Projecteer exact één combineroutline per frame. Dit is de verplichte én enige clipping voor horizon, ladder, FPV, AoA, ILS en toekomstige attitude-elementen.
- Behoud bestaand UI-artwork in zijn huidige vorm.

## Fase 3 — Horizon en ladders
- Maak de echte horizon uit samples van world-richtingen die orthogonaal zijn aan `earthUp`, en projecteer die via camera en combiner. Gebruik nooit een Earth-plane/combin-plane-intersectie.
- Laat dezelfde generator ook de 0-graden-pitchlijn produceren.
- Voeg tijdelijk mutable `this.isPitchLadderCaged = false` toe, zonder controls of persistence. De caged-reference is boresight; de uncaged-reference is de geprojecteerde FPV.
- Laat `drawPitchLadder` de centraal geselecteerde reference gebruiken, elke pitchhoek Earth-relatief opbouwen vanuit het `earthUp`/reference-frame, en semantische endpoints en label anchors projecteren.
- Gebruik voor FPV uitsluitend geldige `airVelocity`, met `velocity` alleen als fallback. Gebruik nooit attitude heading, AoA of LLA-delta’s; verzin geen geometrie bij ongeldige velocity.
- Laat FPV, AoA, ILS en boresight hetzelfde frame delen.

## Fase 4 — Oude 2D-logica verwijderen
- Werk draw-signatures bij en verwijder ongebruikte `computeHudGeometry`, `getCurrentCameraZ`, `updateFpvState` en `computeFpvScreenPosition`.
- Verwijder bijbehorende state en magic parallax-, cameraafstand- en pixels-per-degree-positionering.
- Verwijder canvas-rotatie en lokale attitudecomputaties.
- Behoud de layout van vaste tekst en readouts.

## Fase 5 — Verificatie
- Voer uitsluitend de bestaande `npm run build` uit; voeg geen tests of linters toe.
- Voer in GeoFS een handmatige matrix uit voor alle cockpitmapresets: runway; altitude; climbs/descent; positieve/negatieve pitch; roll/inverted; yaw; head motion; FOV; combiner tilt; wind met `airVelocity` en de `velocity`-fallback; beide boolean modes; outline edges; en gedrag bij ongeldige configuratie/velocities.
- Bevestig expliciet dat tijdens de planning geen repositorycode is gewijzigd.