/**
 * This let's the cryptocontrol plugin know that the extension has been installed.
 */
let beacon = document.createElement("div");
beacon.id = "ccio-firefox-ext-beacon"
beacon.className = browser.runtime.id;
document.body.appendChild(beacon);
