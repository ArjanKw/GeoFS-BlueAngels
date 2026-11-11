// ==UserScript==
// @name         GeoFS A-10 Addon
// @namespace    https://github.com/ArjanKw/GeoFS-BlueAngels/
// @version      3.0.0
// @description  Improves the cockpit with a new HUD and custom MFDs, adjustable seat height and more.
// @author       Natrium
// @match        https://geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        none
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/core/runtime.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/HelperModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/OptionModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/WeaponModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/CombatMathModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/WeaponOverlayModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/TargetModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/WeaponAudioModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/KeybindModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/WeaponHudModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/ProjectileModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/AACombatModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/MultiplayerModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/ChecklistModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/DataCartridgeModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/NavModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/MapModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/RadarModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/CommunicationModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/RecorderModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/F18MfdUiState.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/SystemModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/FlightModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/TargetingPodModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/F18HudModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/CameraModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/FMCModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/ControlModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/modules/MfdModule.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/defaults/WeaponModuleDefaults.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/defaults/ChecklistModuleDefaults.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/aircrafts/BasePlugin.js
// @require      https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/aircrafts/A10MainPlugin.js
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '3.0.0';

  const PluginCtor = window.A10MainPlugin;
  if (typeof PluginCtor !== 'function') {
    console.error('[GeoFS A-10 Addon] A10MainPlugin is not available on window.');
    return;
  }

  const plugin = new PluginCtor({ version: VERSION });
  window.A10Plugin = plugin;
  window.BasePlugin.registerPlugin(plugin);
})();
