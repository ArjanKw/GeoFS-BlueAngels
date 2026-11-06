# F/A-18 HUD Reference: Pitch Ladder, Horizon Line and Flight Path Vector (FPV)

## Purpose

This document describes the expected behavior of the F/A-18 HUD pitch ladder, artificial horizon, and Flight Path Vector (FPV), both from a real-world HUD perspective and how they must be implemented in GeoFS.

The goal is to define unambiguous requirements that can be validated objectively. If an implementation satisfies all requirements below, the HUD geometry will be correct regardless of aircraft attitude, camera position, HUD tilt, head movement, or viewing angle.

---

# Step 1: Real F/A-18 HUD Behavior

## Coordinate Systems

The HUD contains several independent concepts that must not be confused:

1. **Aircraft boresight**
   - The aircraft's longitudinal axis.
   - Represents where the nose points.

2. **Flight Path Vector (FPV)**
   - Represents where the aircraft is actually moving through the air.
   - Derived from velocity vector, not aircraft attitude.
   - Can be above, below, left, or right of boresight.

3. **Earth Horizon Plane**
   - The true local horizontal plane perpendicular to gravity.
   - Independent of aircraft pitch, roll, or yaw.

4. **Pitch Ladder**
   - A set of pitch reference lines.
   - Represents aircraft attitude relative to the Earth horizon plane.

---

# Viewpoint-Dependent HUD Projection (Parallax-correctie)
![HUD goal](Images/scripts/HUD.png)

## Kernconcept
De HUD is een fysiek glasvlak dat op een vaste positie in de cockpit is gemonteerd. De horizon en symbolen (zoals de FPV) bevinden zich in de echte 3D-wereld. Om te bepalen waar een symbool op het glas getekend moet worden, moet er een 3D-projectie worden berekend: een denkbeeldige lijn (ray) loopt vanuit de **exacte camerapositie (oogpunt)** door de **3D-richting in de wereld** naar het **vlak van het HUD-glas**.

## Wat er moet gebeuren bij stoel- of kamerveranderingen:
1. **Vast in de wereld:** Vanuit het perspectief van de vlieger blijft de getekende horizon exact op de echte horizon in de buitenwereld liggen.
2. **Verschuiving op het glas:** Verandert de positie van de camera (bijvoorbeeld doordat de stoel naar beneden gaat)? Dan verandert de hoek van waaruit je door het glas kijkt. Het snijpunt van jouw kijklijn met het glas verschuift daardoor.
3. **Correcte rendering:** Als de HUD lager komt te hangen ten opzichte van je hoofd, moet de horizon op het glas juist *hoger* getekend worden om ervoor te zorgen dat deze optisch op exact dezelfde plek in de buitenwereld blijft overlappen.

## Technische benaming
* **Ray-plane intersection** (straal-vlak snijpunt) vanaf de cameratranslatie naar het combiner-vlak.
* **Combiner parallax compensation** (compensatie voor parallax op het HUD-kijkglas).


# Earth Horizon Representation

## Real Behavior

The horizon displayed on the HUD is not tied to the aircraft.

It represents the intersection between:

- the Earth's local horizontal plane, and
- the pilot's viewing direction projected onto the HUD combiner glass.

As the aircraft rolls:

- the horizon rotates with the Earth reference,
- not with the aircraft.

As the aircraft pitches:

- the horizon moves vertically.

As the aircraft yaws:

- the horizon remains level with the Earth.

### Important

The horizon does NOT represent:

- sea level,
- terrain elevation,
- visible terrain horizon,
- Earth's geometric curvature.

It represents the local attitude horizon used by the INS / attitude system.

---

# Flight Path Vector (FPV)

## Real Behavior

The FPV shows where the aircraft is currently travelling.

Examples:

### Straight and level flight

Aircraft pitch: +3°

Flight path angle: 0°

Result:

- FPV appears on the horizon.
- Nose is above the horizon.

### Climbing

Aircraft pitch: +10°

Flight path angle: +5°

Result:

- FPV appears 5° above the horizon.
- Aircraft boresight appears 10° above horizon.

### High AoA

Aircraft pitch: +20°

Flight path angle: +2°

Result:

- FPV remains 2° above horizon.
- Nose points much higher.

---

# Pitch Ladder

## Real Behavior

The pitch ladder is an attitude reference system.

Each ladder line represents a constant pitch angle relative to the Earth horizon.

Examples:

- +20 line
- +10 line
- +5 line
- -5 line
- -10 line
etc.

---

## Relationship Between Pitch Ladder and Horizon

The horizon line is the 0° pitch line.

Therefore:

- Horizon = 0°
- +5 pitch line = 5° above horizon
- +10 pitch line = 10° above horizon
- -10 pitch line = 10° below horizon

The ladder spacing is angular, not pixel-based.

---

## Relationship Between Pitch Ladder and Roll

The entire pitch ladder rotates with aircraft roll.

For example:

### Wings level

Roll = 0°

Horizon line appears horizontal.

Pitch ladder appears horizontal.

### Right bank

Roll = 45°

Horizon rotates 45° clockwise.

Entire pitch ladder rotates 45° clockwise.

### Inverted

Roll = 180°

Pitch ladder appears upside down.

All lines remain correctly referenced to Earth.

---

# Relationship Between Pitch Ladder and FPV

## Uncaged Mode

In the F/A-18 normal HUD mode, the pitch ladder is stabilized around the FPV.

This means:

- FPV acts as the ladder center reference.
- Ladder remains attitude-referenced.
- Ladder rotates with roll.
- Ladder translates such that the FPV occupies the appropriate ladder location.

Pilot interpretation:

The FPV appears embedded within the pitch ladder.

The ladder effectively "follows" the FPV while still representing true pitch angles relative to the Earth horizon.

---

## Caged Mode

When the ladder is caged:

- FPV stabilization is removed.
- Ladder becomes centered on aircraft boresight.
- Ladder is no longer translated to follow the FPV.

Roll and pitch references remain Earth-referenced.

Only the centering reference changes.

---

# Step 2: GeoFS Implementation Requirements

## Fundamental Rule

The HUD must be treated as a geometric projection problem.

The HUD is NOT a 2D overlay with manually positioned graphics.

No element may rely on:

- hardcoded offsets,
- empirical tuning,
- magic numbers,
- screen-space assumptions.

Every HUD element must be generated from actual 3D geometry projected through the active camera.

---

# Requirement 1: Use the Actual Camera

All HUD calculations shall use:

- actual camera position,
- actual camera orientation,
- actual viewport projection matrix.

The implementation must work correctly when:

- camera moves up,
- camera moves down,
- camera moves left,
- camera moves right,
- camera zoom changes,
- field of view changes.

No HUD element may assume a fixed pilot eye position.

---

# Requirement 2: Use the Actual HUD Plane

The HUD combiner glass defines a physical plane.

Every HUD symbol must ultimately be projected onto this plane.

Calculations shall not assume:

- HUD vertical,
- HUD centered,
- HUD aligned with aircraft axes.

If the HUD is tilted by 20° in 3D space, the projected result must remain correct without any special-case code.

---

# Requirement 3: Horizon Generation

The horizon must be generated from the local Earth horizontal plane.

Algorithmically:

1. Obtain local gravity direction.
2. Construct local horizontal plane.
3. Intersect or sample that plane in front of the aircraft.
4. Project resulting points through the camera onto the HUD plane.

Result:

The rendered horizon must always represent the true attitude horizon.

# Requirement 4: Determine GeoFS values early on

Do not determine GeoFS values while doing the computations, but start by collecting the data necessary for the calculations, THEN do them.
This way we can easily swap GeoFS data input (if the provided data is the problem) in one place.

---

## Validation

### Aircraft on runway

The displayed horizon coincides with real-world horizon.

### Aircraft at 10,000 ft

The displayed horizon remains attitude-correct.

The horizon is NOT forced to remain at the same screen location as on the ground.

Its location must arise naturally from geometric projection.

No altitude correction constants are allowed.

---

# Requirement 5: Horizon Must Survive Head Movement

If the pilot viewpoint moves:

- up,
- down,
- left,
- right,

the projected horizon shall shift exactly as a collimated HUD would.

The implementation must produce the correct result solely from camera projection mathematics.

No horizon recentering logic is permitted.

---

# Requirement 6: Pitch Ladder Generation

Pitch ladder lines must be generated from angular offsets relative to the Earth horizon plane.

For every pitch angle P:

- create a plane corresponding to pitch angle P,
- generate the ladder line in 3D,
- project onto HUD plane.

The displayed result shall emerge from geometry.

It shall not be created by:

- moving 2D sprites,
- adding pixel offsets,
- rotating screen-space artwork.

---

# Requirement 7: Roll Behavior

Pitch ladder rotation must derive from aircraft attitude relative to the local horizon frame.

When aircraft roll changes:

- all ladder lines rotate accordingly,
- horizon remains Earth-referenced,
- ladder remains Earth-referenced.

No separate screen-space rotation system may exist.

---

# Requirement 8: FPV Generation

FPV shall be generated from the actual velocity vector.

Inputs:

- world velocity vector,
- camera transform,
- HUD projection geometry.

The FPV must never be calculated from:

- aircraft pitch,
- aircraft orientation,
- angle of attack assumptions.

The FPV represents motion direction only.

---

# Requirement 9: Uncaged Ladder

In uncaged mode:

- ladder is stabilized around FPV.
- ladder follows FPV translation.
- ladder retains Earth-referenced pitch geometry.
- ladder retains correct roll orientation.

Both statements must remain simultaneously true:

1. Pitch ladder rotates according to attitude.
2. Pitch ladder remains centered on FPV.

---

# Requirement 10: Caged Ladder

In caged mode:

- ladder center reference becomes boresight.
- FPV translation influence is removed.
- pitch and roll geometry remain unchanged.

Only the centering reference changes.

---

# Acceptance Criteria

An implementation is considered correct only if all of the following are true:

1. Horizon remains Earth-referenced at all times.
2. Horizon position is derived from projection mathematics only.
3. No magic numbers are required to align the horizon.
4. Camera movement automatically produces correct HUD parallax.
5. HUD tilt requires no special handling.
6. Pitch ladder rotates correctly with roll.
7. Pitch ladder remains referenced to the Earth horizon.
8. FPV represents velocity vector only.
9. Uncaged ladder remains centered on FPV.
10. Caged ladder remains centered on boresight.
11. All HUD elements are generated from 3D geometry projected through the active camera.
12. The implementation remains correct for any valid camera position, view direction, field of view, aircraft attitude, altitude, or HUD orientation without additional correction factors.
