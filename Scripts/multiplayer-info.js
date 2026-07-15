// ==UserScript==
// @name         Multiplayer label info
// @namespace    http://tampermonkey.net/
// @version      2025-09-30
// @description  Shows the distance of the other player in the label.
// @author       Natrium
// @match        https://geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let multiplayerDistanceUpdateFrequency = 500; // The X amount of ms in between updates.
    let showAircraftType = true; // Whether to cycle between the callsign and the aircraft type.
    let showAircraftTypeEvery = 10; // Every X times that the distance is updated, show the aircraft type.
    let displayAircraftTypeDuration = 2; // The number of updates that the aircraft type is shown.
    let minimumNmDistance = 0.5; // Below this distance in nm, the distance is displayed in feet.
    let displayLabel = true; // Whether to display the label.
    let toggleDisplayKey = "l"; // The key to press to see/hide labels.
    let counter = 0;
    let msToKnots = 1.94384;
    let feetInNm = 6076.11549;

    function updateMultiplayer() {
        counter++;

        Object.values(multiplayer?.visibleUsers).forEach(function (e) {
            if (e.label && e.callsign) {
                if (!displayLabel) {
                    e.label.text = "";
                    return;
                }
                let distance = e.distance;
                let speed = e.lastUpdate?.st?.as;
                let unit = "feet";
                let speedLabel = "";

                let closingSpeed = calculateClosingSpeed(geofs.aircraft.instance.llaLocation, geofs.animation.values.heading, geofs.animation.values.airspeedms * msToKnots, e.lastUpdate);

                //console.log(e.lastUpdate);

                if ((distance / feetInNm) > minimumNmDistance) {
                    // Convert to nm and round with two decimals.
                    distance = (Math.round(distance / feetInNm * 100) / 100);
                    unit = "nm";
                } else {
                    // Round in whole feet.
                    distance = Math.round(distance);
                }

                if (speed) {
                    speedLabel = Math.round(speed) + " knots, ";
                }

                if (showAircraftType && (counter % showAircraftTypeEvery <= displayAircraftTypeDuration)) {
                    e.label.text = e.aircraftName + " (" + speedLabel + "(" + Math.round(closingSpeed.closingSpeedKnots) + ") " + distance + " " + unit + ")";
                } else {
                    e.label.text = e.callsign + " (" + speedLabel + "(" + Math.round(closingSpeed.closingSpeedKnots) + ") " + distance + " " + unit + ")";
                }
            }
        });
    }

   function calculateClosingSpeed(myPos, myHeading, mySpeedKnots, otherData) {
        const DEG_TO_RAD = Math.PI / 180;
        const M_TO_NM = 0.000539957;

        // My velocity vector in knots
        const myHeadingRad = myHeading * DEG_TO_RAD;
        const myVelKnots = [
            mySpeedKnots * Math.sin(myHeadingRad),
            mySpeedKnots * Math.cos(myHeadingRad),
            0
        ];

        // Other aircraft velocity vector in knots
        const otherHeadingRad = otherData.co[3] * DEG_TO_RAD;
        const otherVelKnots = [
            otherData.st.as * Math.sin(otherHeadingRad),
            otherData.st.as * Math.cos(otherHeadingRad),
            0
        ];

        // Position difference
        const latAvg = ((myPos[0] + otherData.co[0]) / 2) * DEG_TO_RAD;
        const dx = (otherData.co[1] - myPos[1]) * 111320 * Math.cos(latAvg);
        const dy = (otherData.co[0] - myPos[0]) * 110540;
        const dz = otherData.co[2] - myPos[2];
        const d = [dx, dy, dz];

        const dMag = Math.sqrt(d[0]**2 + d[1]**2 + d[2]**2);
        const dUnit = [d[0]/dMag, d[1]/dMag, d[2]/dMag];
        const distanceNM = dMag * M_TO_NM;

        // Relative velocity
        const relVelKnots = [
            otherVelKnots[0] - myVelKnots[0],
            otherVelKnots[1] - myVelKnots[1],
            otherVelKnots[2] - myVelKnots[2]
        ];

        // Closing speed
        const closingSpeedKnots = relVelKnots[0]*dUnit[0] + relVelKnots[1]*dUnit[1] + relVelKnots[2]*dUnit[2];
        return {
            closingSpeedKnots,
            distanceNM
        };
    }

    window.addEventListener("keyup", function (e) {
        if (e.key == toggleDisplayKey) {
            displayLabel = !displayLabel;
        }
    });

    setInterval(function () {
        updateMultiplayer();
    }, multiplayerDistanceUpdateFrequency);
})();