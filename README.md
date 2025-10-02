Github page for the GeoFS Blue Angels.

# Blue Angels livery
This allows the GeoFS Blue Angels team to use their Blue Angels livery, and see it in multiplayer, using the Livery Selector.
In the Livery Selector, add this Virtual Airline URL: https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/airline.json

Now you can select the Blue Angels livery of your choice:

![Virtual airline](virtual-airline.png)

## Create your own livery.
Install Inkscape and open `Blue-Angels-Texture-Inkscape-Template.svg`. With this file you can change the callsign next to the canopy, and choose a number on the tail. Export it to png.

If you want to have the livery available in the livery selector:
1) Edit airline.json and add the livery.
2) Place the png in this folder.
3) Push to the main branch.

If you don't have rights for this, create an Issue or Pull Request with the requested changes.

# Manual
Our manual contains our way of working and procedures. It also details how to set up Geo-FS.

# Scripts
These scripts are used by the GeoFS Blue Angels to improve their flying. Install the browser extension Tampermonkey to manage these scripts easily.

## Multiplayer info
With this script you see the speed, distance and aircraft type for each aircraft, so you can intercept them easily. Press the 'L' key to see/hide labels.

![See multiplayer info](multiplayer-info.png)

Installation: [add this script](https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/multiplayer-info.js) to Tampermonkey, or execute it in Developer Console.

## Flight path vector
With this script you see where you are flying to, with a flight path vector. The author of this script is [Tylerbmusic](https://github.com/tylerbmusic/GeoFS-Flight-Path-Vector/) and GGamerGGuy. We changed it, so you can press the letter 'Q' to show/hide the flight path vector.

Installation: [add this script](https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/geo-fs-flight-path-vector.js) to Tampermonkey, or execute it in Developer Console.

# Images
To create the manual, we needed some images. For that we used Adobe Illustrator. You can find the editable file in `Images/Blue Angels.ai`, along with exports of the images.