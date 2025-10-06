// ==UserScript==
// @name         GeoFS Flight Info Display
// @namespace    http://tampermonkey.net/
// @version      2025-10-05
// @description  Shows flight info and warns for stall or gear up landing.
// @author       Natrium
// @match        https://geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let updateFrequency = 100; // The X amount of ms in between updates.
    let minFlightLevel = 100; // Will hide the FL when below this FL.
    let safeGearFlapsSpeed = 250; // A speed above this is unsafe for the gears or the flaps to be deployed.
    let minMachNumber = 0.7; // Will hide the mach number below this.
    let displayMode = parseInt(localStorage.getItem("displayMode") ?? 1, 10);
    let changeDisplayModeKey = "u"; // The key to press to see/hide the info.
    let msToKnots = 1.94384;
    let bottom = document.getElementsByClassName('geofs-ui-bottom')[0];
    let counter = 0;

    bottom.insertAdjacentHTML(
        "beforeend",
        '<button id="natrium-flight-info" class="geofs-button-fullscreen mdl-button mdl-js-button geofs-f-standard-ui geofs-hideForApp" onclick="changeFlightInfoMode()" data-tooltip-classname="mdl-tooltip--top" data-upgraded=",MaterialButton"></button>'
    );

    let infoDisplay = document.getElementById("natrium-flight-info");

    function updateFlightInfo() {
        counter++;
        counter = counter % 10;

        let groundSpeed = "GS: " + geofs.animation.values.groundSpeedKnt.toLocaleString('en-US', { maximumFractionDigits: 0 }) + " kn";
        let trueAirSpeed = (geofs.animation.values.airspeedms * msToKnots).toLocaleString('en-US', { maximumFractionDigits: 0 }) + " kn";
        let mach = Math.round(geofs.animation.values.mach * 100) / 100;
        if (mach > minMachNumber) {
            mach = "M" + mach;
        } else {
            mach = "";
        }
        let inLandingConfig = geofs.animation.values.airspeedms * msToKnots < 200 && geofs.animation.values.altitude < 1000 && geofs.animation.values.climbrate < 0;
        let altAboveGround = geofs.animation.values.altitude.toLocaleString('en-US', { maximumFractionDigits: 0 }) + " ft";

        let flightLevel = geofs.animation.values.altitude / 100;
        if (flightLevel >= minFlightLevel) {
            if (flightLevel < 100) {
                flightLevel = "0" + flightLevel;
            }
            flightLevel = "FL" + flightLevel.toLocaleString('en-US', { maximumFractionDigits: 0 }) + " - ";
        } else {
            flightLevel = "";
        }

        let climbrate = geofs.animation.values.climbrate;
        if (climbrate > 0) {
            climbrate = " (+" + climbrate.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ")";
        } else if (climbrate == 0) {
            climbrate = "";
        } else {
            climbrate = " (" + climbrate.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ")";
        }
        let windspeed = Math.round(geofs.animation.values.windSpeed);
        if (windspeed != 0) {
            windspeed = "  |  Wind: " + geofs.animation.values.windSpeedLabel;
        } else {
            windspeed = "";
        }
        let flaps = geofs.animation.values.flapsValue;
        if (flaps == 0) {
            if (inLandingConfig && counter < 5) {
                flaps = "<span style='color: red;'>FLAPS UP</span>";
            } else if (inLandingConfig) {
                flaps = "<span style='color: yellow;'>FLAPS UP</span>";
            } else {
                flaps = "FLAPS: UP";
            }
        } else if (flaps > 0 && flaps < 1) {
            if (geofs.animation.values.airspeedms * msToKnots > safeGearFlapsSpeed && counter < 5) {
                flaps = "<span style='color: red;'>FLAPS: 1/2</span>";
            } else if (geofs.animation.values.airspeedms * msToKnots > safeGearFlapsSpeed) {
                flaps = "<span style='color: yellow;'>FLAPS: 1/2</span>";
            } else {
                flaps = "<span style='color: orange;'>FLAPS: 1/2</span>";
            }
        } else {
            if (geofs.animation.values.airspeedms * msToKnots > safeGearFlapsSpeed && counter < 5) {
                flaps = "<span style='color: red;'>FLAPS: DOWN</span>";
            } else if (geofs.animation.values.airspeedms * msToKnots > safeGearFlapsSpeed) {
                flaps = "<span style='color: yellow;'>FLAPS: DOWN</span>";
            } else {
                flaps = "<span style='color: green;'>FLAPS: DOWN</span>";
            }
        }

        let gear = geofs.animation.values.gearPosition;
        if (gear == 1) {
            if (inLandingConfig && counter < 5) {
                gear = "<span style='color: red;'>GEAR UP</span>";
            } else if (inLandingConfig) {
                gear = "<span style='color: yellow;'>GEAR UP</span>";
            } else {
                gear = "GEAR UP";
            }
        } else if (gear == 0) {
            if (geofs.animation.values.airspeedms * msToKnots > safeGearFlapsSpeed && counter < 5) {
                gear = "<span style='color: red;'>GEAR DOWN</span>";
            } else if (geofs.animation.values.airspeedms * msToKnots > safeGearFlapsSpeed) {
                gear = "<span style='color: yellow;'>GEAR DOWN</span>";
            } else {
                gear = "<span style='color: green;'>GEAR DOWN</span>";
            }
        } else {
            gear = "<span style='color: orange;'>GEAR TRANS</span>";
        }
        let aoa = "AOA: " + Math.round(geofs.aircraft.instance.angleOfAttackDeg * 10) / 10 + "°";
        if (geofs.animation.values.airspeedms < 3) {
            aoa = "";
        }
        let engine = geofs.animation.values.enginesOn;
        if (!engine && geofs.animation.values.airspeedms > 1 && counter < 5) {
            engine = " - <span style='color: red;'>ENGINE OFF</span>";
        } else if (!engine && geofs.animation.values.airspeedms > 1) {
            engine = " - <span style='color: yellow;'>ENGINE OFF</span>";
        } else if (!engine) {
            engine = " - ENGINE OFF";
        } else {
            engine = "";
        }

        let engineMode = parseInt(localStorage.getItem("engineMode"), 10);
        if (engineMode > 0) {
            let boost = Math.round(geofs.aircraft.instance.definition.maxRPM / 1000) / 10;
            engineMode = " - ENGINE " + localStorage.getItem("engineModeName") + " (x" + boost + ")";
        } else {
            engineMode = "";
        }

        let flightStatus = flaps + " - " + gear + engine + engineMode + windspeed;

        if (geofs.animation.values.stalling && counter < 5) {
            flightStatus = "<span style='color: red;'>STALLING</span>";
        } else if (geofs.animation.values.stalling) {
            flightStatus = "<span style='color: yellow;'>STALLING</span>";
        }

        if (displayMode == 0) {
            infoDisplay.innerHTML = "Info: OFF";
        } else if (displayMode == 1) {
            infoDisplay.innerHTML = "1 | SPD: " + trueAirSpeed + "  |  ALT: " + altAboveGround + "  |  " + flightStatus;
        } else if (displayMode == 2) {
            infoDisplay.innerHTML = "2 | SPD: " + trueAirSpeed + (mach != "" ? " - " + mach : "") + "  |  ALT: " + flightLevel + altAboveGround + "  |  " + flightStatus;
        } else if (displayMode == 3) {
            infoDisplay.innerHTML = "3 | SPD: " + trueAirSpeed + (mach != "" ? " - " + mach : "") + "  |  ALT: " + flightLevel + altAboveGround + climbrate + "  |  " + flightStatus;
        } else if (displayMode == 4) {
            infoDisplay.innerHTML = "4 | SPD: " + trueAirSpeed + (mach != "" ? " - " + mach : "") + "  |  ALT: " + flightLevel + altAboveGround + climbrate + "  |  " + (aoa != "" ? (aoa + "  |  ") : "") + flightStatus;
        } else if (displayMode == 5) {
            if (mach != "") {
                mach = " - " + mach;
            }
            infoDisplay.innerHTML = "5 | TAS: " + trueAirSpeed + " - " + groundSpeed + mach + "  |  ALT: " + flightLevel + altAboveGround + climbrate + "  |  " + (aoa != "" ? (aoa + "  |  ") : "") + flightStatus;
        }
    }

    function changeFlightInfoMode() {
        displayMode++;
        displayMode = displayMode % 6;
        localStorage.setItem("displayMode", displayMode);
    }

    window.addEventListener("keyup", function (e) {
        if (e.key == changeDisplayModeKey) {
            changeFlightInfoMode();
        }
    });

    window.changeFlightInfoMode = changeFlightInfoMode;

    setInterval(function () {
        updateFlightInfo();
    }, updateFrequency);
})();