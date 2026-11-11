# Implementatie advanced weapon module.
Op basis van [F-16 script](../base/f16eegs.js).

## Uitgangspunt
Mijn plugin vult de cockpit van GeoFS vliegtuigen aan met multifunctional displays (MFD's), een betere HUD, en ik simuleer dat je een loadout hebt (AIM-9X, AIM-120C, Gun, etc.). De #WeaponModule.js houdt bij welke raketten etc. geladen zijn, en regelt rearming, wapen selecteren, wapens koppelen aan hardpoint etc. De `render: (renderer, renderContext)` methode zorgt ervoor dat de state in de #MfdModule.js getoond wordt en via `#sym:registerMfdPages ` voegen we de pagina toe waarmee je een raket etc. kan afvuren. Dit wil ik allemaal behouden. Daarnaast wordt op de #F18HudModule.js getoond wat de actief geselecteerde wapen is, enzovoorts. Dat wil ik ook behouden. Tot nu toe gebeurd er niks als je een wapen afvuurt: de counter gaat omlaag, je ziet "FIRE", maar geen gun/raket.

Nu heb ik een nieuw script aangeleverd gekregen: #f16eegs.js. Deze is, in tegenstelling tot mijn add-on alleen geschikt voor de F-16. Wat ik wil overnemen van dit script:
- Het kunnen schieten van raketten en guns, waarbij je daadwerkelijk de  bullets/missile ziet vliegen naar target.
- De HUD weergave van de funnel als je de GUN afschiet.
- De NPC en AA Simulation, waarbij een gevecht gesimuleerd kan worden.
- De multiplayer modus, waarbij meerdere clients tegen elkaar kunnen vechten.
- De keybinds.
- De settings in GeoFS **Options -> General** (behalve die van de 'F-16 EEGS Missile Loadout', want dat moet door mijn plugin geregeld worden)

Wat ik wil dat aangepast wordt:
- Het script moet in mie architectuur ingebouwd worden op de goede plekken en waar mogelijk in een aparte Module.
- Het script moet mijn #WeaponModule.js loadout als basis gebruiken.
- Het script moet werken voor alle vliegtuigen die mijn plugin ondersteund.
- Reloaden (rearm) moet ook via mijn script en alleen als mijn script dat toestaat, niet via Shift + U meteen reloaden.
- Het script noemt een "weapon" een 'wepon'. Gebruik correct Engels.
- De messages als "Radar ON" of hoeveel weapons je nog hebt worden nu in het scherm op random plekken getoond. Dat wil ik niet, deze worden al op de goede plekken via mijn huidige code getoond.

Eisen:
- Maak een goede architectuur. De #F18HudModule.js is verantwoordelijk voor het tonen van de default HUD. Omdat de #attachment:f16eegs.js op een andere manier dingen op de HUD locatie tekent: maak een aparte WeaponHudModule, die de funnel etc. tekent.
- Maak een andere module voor de multiplayer modus en nog een Module voor de A/A Combat Simulation.
- Maak een module die verantwoordelijk wordt voor het renderen van de missiles en bullets enzo. Ik wil dat de huidige modules alleen waar echt nodig worden uitgebreidt, maar dat dit verder losse modules zijn die je kan toevoegen als je die functionaliteit wil in een vliegtuig.
- Zorg ervoor dat de MainPlugins (zoals de #F18MainPlugin.js) ervoor kan kiezen om de modules toe te voegen.

Grill me met vragen om ervoor te zorgen dat er een duidelijk plan komt.

## Vragen
De analyse bevestigt dat dit geen simpele “kopieer `f16eegs.js`”-wijziging is. De grootste architectuurkeuze is: **`WeaponModule` wordt de enige bron van waarheid voor wapens en munitie; nieuwe modules simuleren/renderen/synchroniseren alleen.**

Beantwoord deze vragen zo concreet mogelijk:

### 1. Vuren en target lock

1. Moet een raket **altijd** een radar hard lock vereisen, of mogen sommige wapens (bijv. AIM-9X) ook zonder hard lock worden afgevuurd?
2. Moet de bestaande `WeaponModule.fireSelectedWeapon()` exact de enige ingang blijven voor:
   - MFD FIRE-knop
   - bestaande keybind
   - nieuwe `f16eegs`-keybind
   - multiplayer/NPC-wapens?
3. Wat moet er gebeuren als een wapen geen geldig doel heeft?
   - Niet vuren
   - Toch dumb-fire lanceren
   - Alleen guns toestaan
   - Instelbaar per wapen?

### 2. WeaponModule-loadout

4. Hoe moeten de bestaande loadout-items worden gekoppeld aan de ballistische eigenschappen uit `f16eegs.js`?
   - Op basis van bestaande namen zoals `AIM-9X`, `AIM-120C`, `Gun`
   - Een nieuwe weapon metadata-tabel
   - Per vliegtuig een configuratie die eigenschappen toevoegt?
5. Zijn twee identiek genoemde wapens altijd fysiek hetzelfde, of moet bijvoorbeeld een `AIM-120C` per vliegtuig andere snelheid, range of guidance kunnen hebben?
6. Moet het aantal gun bullets volledig uit de bestaande `WeaponModule`-loadout komen, inclusief de bestaande reload-logica?

### 3. Gun en funnel-HUD

7. Moet de gun:
   - blijven vuren zolang de fire-input ingedrukt is,
   - één burst per druk geven,
   - of moet dit instelbaar zijn?
8. Welke bestaande `F18HudModule`-functionaliteit mag `WeaponHudModule` gebruiken?
   - Canvas/render context delen
   - Alleen onder de bestaande HUD tekenen
   - Eigen canvaslaag creëren?
9. Moet de funnel alleen zichtbaar zijn wanneer `Gun` geselecteerd is en de gun vuurt, of al zodra `Gun` geselecteerd is?

### 4. Projectielen en effecten

10. Verwacht je alleen visuele projectielen, of moeten projectielen ook daadwerkelijk:
    - NPC’s beschadigen,
    - multiplayer-spelers raken,
    - terrain/objecten raken,
    - kills/hits registreren?
11. Moeten missile- en bulletphysics uit `f16eegs.js` zo letterlijk mogelijk behouden blijven, of mogen we deze normaliseren naar een algemene vliegtuig-onafhankelijke projectile-engine?
12. Welke effecten zijn verplicht?
    - missile trails
    - gun tracers
    - impact/explosions
    - audio
    - smoke/flaring/chaff?

### 5. Vliegtuigondersteuning

13. Hoe bepaalt de plugin welke vliegtuigen ondersteund worden?
    - Per `MainPlugin`
    - Via een capability/config-object
    - Via aircraft type/id-detectie?
14. Moeten alle ondersteunde vliegtuigen dezelfde projectile physics gebruiken, of mogen `F18MainPlugin`, andere jets en toekomstige vliegtuigen eigen configuraties aanleveren?
15. Mag de functionaliteit zonder wijziging aan bestaande vliegtuigmodules werken, zolang de `MainPlugin` de optionele modules registreert?

### 6. Rearm

16. Wat zijn precies de voorwaarden waaronder rearming mag?
    - Alleen op de grond
    - Alleen engines uit
    - Alleen bepaalde airports/carriers
    - Alleen via MFD
    - Alleen via een expliciete keybind?
17. Moet een rearm tijdens multiplayer worden gesynchroniseerd?
18. Moet rearm alle stations exact herstellen naar de door `WeaponModule` bepaalde loadout-template, of mogen losse wapens/hardpoints behouden blijven?

### 7. AA Combat Simulation

19. Is AA combat uitsluitend een lokale singleplayer-simulatie, of moeten NPC’s ook zichtbaar/aanvalbaar zijn voor multiplayer-clients?
20. Moeten NPC’s onderdeel worden van dezelfde targetlijst als echte GeoFS-aircraft?
21. Welke instellingen wil je in **Options → General**?
    - AA aan/uit
    - difficulty
    - aantal bandits
    - bandit type
    - missile behavior
    - damage/health
    - friendly fire?
22. Moet de simulatie automatisch starten, of alleen via een keybind/menuactie?

### 8. Multiplayer

23. Is de bestaande GeoFS multiplayer/chat-transportlaag de enige beschikbare transportoptie, of mag er een aparte server/WebSocket-oplossing worden onderzocht?
24. Wat moet multiplayer precies synchroniseren?
    - missile launches
    - bullets/tracers
    - impacts
    - damage
    - kills
    - countermeasures
    - rearming
    - NPC’s?
25. Moeten andere clients projectielen alleen visueel tonen, of moet hit detection autoritatief door één client/server gebeuren?
26. Wat moet er gebeuren bij packet loss of late events: liever visueel imperfect maar speelbaar, of liever geen projectile dan een onbetrouwbare hit?

### 9. Keybinds en instellingen

27. Wil je de keybinds uit `f16eegs.js` exact behouden, of mogen ze worden gewijzigd om botsingen met bestaande GeoFS-/addon-keybinds te voorkomen?
28. Moeten keybinds configureerbaar worden via GeoFS Options, of blijven het vaste toetsen?
29. Welke `f16eegs`-settings moeten expliciet worden uitgesloten naast **F-16 EEGS Missile Loadout**?

### 10. Scope en migratie

30. Mag de eerste implementatie in fasen worden opgeleverd:
    1. WeaponModule-integratie + lokale projectielen,
    2. Weapon HUD/funnel,
    3. AA simulation,
    4. multiplayer?
31. Wil je backwards compatibility met bestaande `f16eegs.js`-gebruikers, of mag het script uiteindelijk volledig vervangen/gearchiveerd worden?
32. Moet de oplossing ook automatisch bestaande `f16eegs`-toestanden uit `localStorage` migreren, of mag de nieuwe architectuur met een nieuwe opslagnamespace beginnen?

Vooral antwoorden op **1–6, 10–15, 16–18 en 23–26** zijn nodig voordat ik een betrouwbaar definitief plan kan maken.

## Antwoorden
1.1: Je hebt altijd een radar hard lock nodig, behalve bij de GUN.
1.2. Volgens mij was er nog geen bestaande keybind. De f16eegs keybind moet gekoppeld worden aan `WeaponModule.fireSelectedWeapon()`. Maak een KeybindModule, waarmee we keybinds kunnen koppelen aan acties in modules. De MFD FIRE knop moet blijven werken.
3. Alleen guns toestaan als er geen geldig doel is.

2.4 Koppel op basis van bestaande namen zoals AIM-9X met de ballistische eigenschappen van F16eegs.js. De AIM-9 uit F16eegs.js mag gekoppeld worden aan AIM-9X. Breidt de metadata config uit zodat alle benodigde weapon metadata die het nieuwe script vereist in de WeaponModule opgeslagen wordt. Per vliegtuig hoef je enkel de loadouts  te configureren (bijv. 2x AIM-9X op hardpoint 1 in A/A config, niet hoe de AIM-9X vliegt.
2.5 Twee identieke wapens zijn fysiek hetzelfde, onafhankelijk van het vliegtuig.
2.6 Ja, aantal gun bullets uit bestaande code, incl. reloadlgoica. 
3.7 Vuur de gun zoals het nieuwe script dat doet.
3.8 Deel wat jou architectureel het beste lijkt.
3.9 Funnel zichtbaar zodra Gun geselecteerd is en WPN.MODE A/A is.
4.10 Ik verwacht dat het nieuwe script hetzelfde doet qua NPC's beschadigen en multiplayer-spelers raken als hoe #attachment:f16eegs.js  nu werkt.
4.11 Behoudt de missile- en bulletphysics uit f16eegs.js
4.12. Alle effecten uit f16eegs.js behouden.
5.13 Elk vliegtuig heeft een `MainPlugin` die het vliegtuig configureert en overerft van BasePlugin. Om er een Tampermonkey script van te maken zijn de scripts in de map `entrypoints`. Hier wordt de plugin geregistreerd via `window.BasePlugin.registerPlugin(plugin);`. En met `#sym:isAircraftActive ` geeft elke plugin terug of het op dat moment actief is.
5.14 Elk ondersteund vliegtuig moet dezelfde projectile physics gebruiken. De physics wordt bepaald door de WeaponModule, niet per vliegtuig.
5.15 Het moet optioneel en backwards compatible zijn. Voor de huidige modules dus enkel toevoegingen.
6.16 Dit is wanneer rearming mag: `HelperModule.isAircraftParkedAndCold() && OptionModule.getOption('WPN', 'MASTER', 'OFF') === 'OFF'` (zie #WeaponModule.js regel 189)
6.17 Denk niet dat dat nodig is (rearm synchroniseren)
6.18 Rearm moet exact herstellen, zoals het script nu werkt.

7.19 Zover ik weet is AA combat uitsluitend lokaal single player. Implementeer het as-is, waarbij je enkel ervoor zorgt dat het past in de nieuwe architectuur.
7.20 Denk dat NPC's toegevoegd moeten worden aan de targetlijst, die nu enkel door multiplayer bepaald wordt. Zorg ervoor dat de nieuwe module dit toe kan voegen .
7.21 Alle genoemde instellingen i Options -> General behouden.
7.22 Start simulatie via menu-actie (die is er nu volgens mij nog niet).
8.23 Implementeer nu enkel de bestaande GeoFS transportlaag. Hier moet later een nieuwe aan toegevoegd kunnen worden.
8.24 Synchroniseer alles wat in het bestaande script zit.
8.25 De effectivenessByType in combinatie met de afstand tot target moet bepalen wat de kans is dat een missile raakt. Bij gun op basis van of hij in de buurt komt. Voor missiles kan dit vantevorenb epaald worden.
8.26 Het moet speelbaar blijven bij packet loss, zover mogelijk.
9.27 Behoudt de keybinds exact, maar zorg dat in de aparte module de keybinds eenvoudig aangepast kunnen worden.
9.28 Maak de keybinds configureerbaar in GeoFS options.
9.29 Verder geen settings uitsluiten naast F-16 EEGS Missile Loadout.
10.30 Implementeer in fasen, zoals jouw voorstel.
10.31 Het f16eegs.js script mag uitgefaseerd worden. Hoeft niet backwards compatible te zijn met dit script.

Uit `#sym:effectivenessByType ` in de #WeaponModule.js mag #sym:max_speed  uitgefaseerd worden. #sym:engagement_window en #sym:effective_range  moeten behouden blijven. Deze bepalen hoe kansrijk het afvuren van een missile is. Integreer dat indien mogelijk met de nieuwe plugin.

Andere eis: zorg voor voldoende commentaar IN HET ENGELS, om duidelijk te maken wat het script doet, wat de classes en methodes doen etc.

## Feedback na implementatie

Stop met implementeren en analyseer de huidige staat van de wijzigingen t.o.v. het plan Ik wil dat de nieuwe code zich meer houdt aan de oorspronkelijke #attachment:f16eegs.js binnen de constraints uit deze chat. Ik wil dat je de gun funnel exact zo bouwt zoals in #attachment:f16eegs.js , het moet er EXACT hetzelfde eruit zien. Nu zijn het twee vaststaande driehoeken metpu nt naar boven. Doe hetzelfde voor hoe de missiles en guns getekend worden. Ik zie nu nog geen missiles als ik een AIM-9X of AIM-120 schiet. Ik zie ook geen nieuwe requires in bijv. #attachment:geo-fs-f18-addon.user.js . Is dat niet nodig? De options zijn nu simpeler geworden. In #attachment:f16eegs.js zag ik nog allerlei opties bij A/A Combat Simulation, in nieuwe situatie enkle een Start / Stop knop. Bij Combat Multiplayer zie ik enkel een Group Code input field, niet de opties, knoppen en text uit #attachment:f16eegs.js . Ik wil naast de architectuur van onze eigen plugin en het gebruiken van wat al bestaat dat zoveel mogelijk van de #attachment:f16eegs.js overgenomen wordt op dezelfde manier zoals eerder aangegeven. Analyseer #attachment:f16eegs.js , analyseer mijn oorspronkelijke eisen en antwoorden, en analyseer in hoeverre de huidige oplossing het oude script goed heeft overgenomen. Schrijf een plan wat nodig is om dit te implementeren. Einddoel is dat de functionaliteit uit het oude script allemaal werkt, en dat het waar bestaand de bestaande modules gebruikt als de #WeaponModule.js, zodat er geen dubbele loadout is bijvoorbeeld. Analyseer mijn oorspronkelijke requirements, antwoord op de vragen en kijk wat de huidige staat is.

## Implementatie
## Plan: de f16eegs-functionaliteit volledig overnemen in de modulaire architectuur

Ik heb de eisen, je antwoorden en de feedback gelezen, [f16eegs.js](c:/git/GeoFS-BlueAngels/Scripts/base/f16eegs.js) en de nieuwe modules. Ik heb nog geen enkele test uitgevoerd. Er is ook geen plan opgeslagen in `/memories/session/plan.md`, omdat ik die tool niet heb. Het plan staat hieronder.

### Analyse van de huidige staat

**Wat goed is:**
- De entrypoints hebben de nieuwe `@require`-regels voor alle vijf modules, dus daar hoeft niets bij.
- [WeaponModule.js](c:/git/GeoFS-BlueAngels/Scripts/addon/modules/WeaponModule.js) heeft een eventsysteem (`on` / `emit`), `emitFireEvent` en `projectileMetadataByType`.
- De rearm-regels en het gebruik van de loadout kloppen.
- `KeybindModule` gebruikt `OptionModule`.

**Waarom je geen raketten ziet:**
1. **Lock komt van twee kanten.** `WeaponModule.hasRadarHardLock()` kijkt naar `radar.hardLockedUid`. `ProjectileModule.spawn` pakt `targetProvider.lockedTargetId`, dat uit `AACombatModule` komt. Dat zijn verschillende locks. De raket krijgt daardoor geen doel of een verkeerd doel en `getTarget` geeft `null`.
2. **Verkeerde tekenmethode.** f16eegs tekent op een eigen fullscreen canvas. Het projecteert wereldpunten met `toScreen` en `Cesium.SceneTransforms`. De nieuwe code tekent in de `genericHUD`-canvas via `GeoFsHudPostRenderHooks`. Die hooks worden alleen aangeroepen door `F18HudModule`, en alleen binnen de HUD-clip. Raketten en kogels hebben dus geen eigen scherm-projectie. Ze verdwijnen op elk vliegtuig zonder die HUD.
3. **Dubbele kogels.** In `processGunFireTick` (regel 563–566) staat `emitFireEvent` twee keer. Dat levert dubbele kogels en dubbele multiplayer-events op.

**Gap per onderdeel:**

| Onderdeel | f16eegs | Nu |
|---|---|---|
| Gun funnel | Ballistische berekening (drag, zwaartekracht, relatieve beweging), vleugelspanwijdte-lijnen, rangeticks 0.5 / 1.0 / 1.5 / 2.0, kruis, ammo-tekst, clip op HUD-FOV (regels 2822–2927) | Twee statische driehoeken in [WeaponHudModule.js](c:/git/GeoFS-BlueAngels/Scripts/addon/modules/WeaponHudModule.js) |
| Gun / tracers / impacts | Tracers elke 5e kogel, kleur `#eb9800`, impactmarkering, terreincontrole | Cirkels in `ProjectileModule` |
| Raketten | Eigen model met rooktrail en glow, hit/miss vooraf bepaald, flare-evade | Basisversie, geen goede visuals |
| A/A-simulatie | 6 moeilijkheden, bandits, NPC-raketten met geleiding, NPC-flares, mini-radar 30 NM, bandit-HUD-POI, damage / kills / hits | Bandits en positie-updates, maar geen rendering, geen geleiding, geen flares, geen radar |
| Opties A/A | Statustekst, Difficulty-select (1–6 met namen), Bandits-select (1–10), POI-checkbox, knoppen Start/Restart en Stop | Enkel Start/Stop |
| Opties Multiplayer | Enable-checkbox, Group-code input (16 tekens), Generate Group Code, Send Sync Test, uitleg | Enkel groepscode |
| Multiplayer | Protocol `F7|` met `L` / `H` / `D` / `X` / `T`, ontvangen en renderen van netwerkraketten, hit- en evade-meldingen, FNV-fingerprint | Alleen versturen van launches |
| Audio | Gun, raket, countermeasures | Ontbreekt |
| Toasts | Op random plekken op het scherm | Moeten via de bestaande HUD/MFD-berichten |
| Doelen | T-modus, `,` / `/` doel kiezen, Enter lock, hit-radius 28 m | Aanwezig, maar niet gekoppeld aan de radar-hardlock |
| Keybinds | Exacte toetsen | `KeybindModule` aanwezig, maar controle op exacte toetsen en acties moet nog |

Uit de samenvatting van de verkenning laat ik **G-LOC/blackout, cockpit-browserpanelen en HUD-offset met Alt+pijltjes** bewust buiten het plan. Die hoorden niet bij je eisen. Zeg het als je ze toch wilt.

### Stappen

**Fase 0 – Fundament (blokkeert de rest)**
1. Verwijder de dubbele `emitFireEvent` in `WeaponModule.processGunFireTick`.
2. Maak één bron voor doelen en lock. De huidige 'Enter lock' van f16eegs wordt de enige hardlock, zodat `WeaponModule.hasRadarHardLock()` en `ProjectileModule` hetzelfde doel gebruiken.
   - Bouw een `TargetModule` (of breid `AACombatModule` uit) met `getTargets()`, `selectedTargetId` en `lockedTargetId`.
   - Laat deze de multiplayer-spelers combineren met NPC's uit de simulatie.
   - Laat `hasRadarHardLock()` hiernaar kijken, naast de bestaande radar-lock.
3. Maak een nieuwe `WeaponOverlayModule` (eigen fullscreen canvas, zoals f16eegs). Die levert `toScreen`, `ang`, `pxPerRad`, een frame-loop en een registratielijst voor tekenfuncties. `WeaponHudModule`, `ProjectileModule`, `AACombatModule` en de radar tekenen hier in, niet meer via `GeoFsHudPostRenderHooks`. Zo werken ze op elk ondersteund vliegtuig. *Hangt af van stap 2 voor de doelen.*
4. Voeg de metadata die f16eegs nodig heeft toe aan `WeaponModule.projectileMetadataByType`: snelheid, `turnRate`, `maxFlightTime`, kogel-ballistiek en `tracerEvery`. Gebruik `AIM-9X` als de AIM-9 uit f16eegs en `AIM-120C` / `AIM-120D` voor de AIM-120. Laat `max_speed` uit `effectivenessByType` vervallen. Gebruik `engagement_window` en `effective_range` voor de hit-kans, gecombineerd met de afstand.

**Fase 1 – Lokale projectielen en effecten** *(hangt af van fase 0)*
5. Port de raket- en kogelfysica en het tekenen letterlijk uit f16eegs naar `ProjectileModule`, op de overlay-canvas:
   - raketmodel met trail en glow;
   - tracers (elke 5e kogel, `#eb9800`);
   - impacts (grijs, 500 ms);
   - terreincontrole;
   - schade aan NPC's (28 m, 3 HP).
6. Port de audio (gun, raket, countermeasures) naar een aparte `WeaponAudioModule`.
7. Port flares/chaff met seeker-decoying naar de modules.

**Fase 2 – Gun funnel en HUD** *(parallel met fase 1)*
8. Vervang `WeaponHudModule.render` door een exacte port van f16eegs (regels 2822–2927): kruis, ballistische funnel met wingspan-lijnen, rangeticks met labels, ammo-tekst en HUD-FOV-clip. Toon de funnel alleen als `Gun` geselecteerd is en `WPN.MODE` gelijk is aan `A/A`. Gebruik het aantal kogels uit `WeaponModule`.
9. Laat de messages "Radar ON" en ammo-tellers via bestaande HUD- of MFD-code lopen. Verwijder de random-plaatsing van f16eegs.

**Fase 3 – A/A-simulatie** *(hangt af van fase 1)*
10. Breid `AACombatModule` uit met de 6 moeilijkheden uit f16eegs (snelheid, bochtsnelheid, aanvalsafstand, vertraging, raketsnelheid, flare-kans).
11. Voeg NPC-raketten met geleiding (`turnVelocity`), NPC-flares (`#ffd26a`), renderen van NPC-raketten met rode trail (`#ff5555`) en incoming-audio/toasts toe.
12. Voeg de mini-radar van 30 NM (66 px) en de bandit-HUD-POI's toe. Laat NPC's tellen in de targetlijst uit stap 2.
13. Voeg het menu-item "Start / Restart A/A" en "Stop Simulation" toe.

**Fase 4 – Multiplayer** *(hangt af van fase 1, parallel met fase 3)*
14. Bouw `MultiplayerModule` uit met het hele `F7|`-protocol: `L` (3 vol / 2 compact), `H`, `D`, `X`, `T`, plus de FNV-fingerprint. Voeg ontvangst toe en het renderen van netwerkraketten. Hou het speelbaar bij packet loss (event verlopen = geen projectiel).
15. Maak de transportlaag vervangbaar. Alleen de GeoFS-chat-transport is nu nodig.

**Fase 5 – Opties en keybinds**
16. Bouw de Options → General-secties na zoals in f16eegs:
    - **A/A Combat Simulation:** statustekst, Difficulty (1–6 met namen), Bandits (1–10), POI-checkbox, Start/Restart, Stop.
    - **Combat Multiplayer:** Enable-checkbox, Group code (16 tekens, `[a-zA-Z0-9_-]`), Generate Group Code, Send Sync Test, uitlegtekst.
17. Controleer en herstel de exacte toetsen van f16eegs in `KeybindModule`. Alle toetsen blijven eenvoudig aan te passen via `OptionModule`, zoals je vroeg. Rearm loopt alleen via `WeaponModule.startRearm`, niet via Shift+U.

**Fase 6 – Integratie en opschonen**
18. Pas `BasePlugin.initializeOptionalModules` aan: voeg `TargetModule`, `WeaponOverlayModule` en `WeaponAudioModule` toe, en bepaal de volgorde van `start()`. [F18MainPlugin.js](c:/git/GeoFS-BlueAngels/Scripts/addon/aircrafts/F18MainPlugin.js), [F16MainPlugin.js](c:/git/GeoFS-BlueAngels/Scripts/addon/aircrafts/F16MainPlugin.js) en de overige `MainPlugin`'s kiezen zelf welke modules ze activeren.
19. Voeg `@require`-regels toe voor elke nieuwe module in **alle** entrypoints. De huidige vijf staan er al, de nieuwe moeten erbij.
20. Verwijder de `GeoFsHudPostRenderHooks`-aanroepen uit `F18HudModule` als niets ze meer gebruikt.
21. Voeg Engelse commentaar toe bij alle klassen en methodes, en gebruik overal "weapon".

### Verificatie
1. Build met `build.js` en laad het script in GeoFS voor F-16 en F-18.
2. Test AIM-9X en AIM-120: selecteer een doel met T, vergrendel met Enter en vuur met de MFD FIRE-knop én de keybind. Controleer dat de raket zichtbaar vliegt en dat de teller omlaag gaat.
3. Vuur de gun: ga na dat de funnel met wingspan-lijnen en rangeticks verschijnt, dat er één kogel per tick verdwijnt (niet twee) en dat de tracers kloppen.
4. Start de A/A-simulatie op elke moeilijkheid: bandits, hun raketten, flares en mini-radar werken, en kills/hits worden geteld.
5. Test multiplayer met twee clients en dezelfde groepscode: launch, hit, evade en expiratie komen aan.
6. Controleer dat rearm alleen werkt met `isAircraftParkedAndCold()` en `MASTER` op `OFF`.
7. Vergelijk de funnel naast f16eegs.

### Beslissingen en scope
- Eén loadout: `WeaponModule`. Geen tweede munitiebron zoals `missileAmmo`.
- Eigen overlay-canvas boven de bestaande HUD voor alles wat Cesium-projectie nodig heeft.
- Buiten scope: G-LOC, cockpit-browserpanelen, HUD-offset kalibratie, rearm-sync.

### Open punten
1. De overlay-canvas kan op sommige vliegtuigen botsen met de eigen HUD-canvas. Aanbeveling: z-index net onder de bestaande HUD, tenzij je anders wilt.
2. Je wilt exact het uiterlijk van f16eegs. Aanbeveling: ook de `CFG`-waarden (kleuren, hoeken, `hudFov`) letterlijk overnemen in één config-object in `WeaponHudModule`.

Zeg het als ik dit plan zo moet laten staan of aanpassen, dan ga ik met fase 0 beginnen.