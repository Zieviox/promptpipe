# Quick start tours (stashed)

Stashed on 2026-11-07 at Gtex's request: on the phone the tour stopped taps
from reaching some controls. Not loaded by the app.

To bring it back: move tour.js into app/src/main/assets/plugins/chat-ui/, add it
to that plugin.json's scripts after help.js, and restore the hooks removed in
the stashing commit (render(): maybeTour/tourLayer/tourSpot; the Quick start
entries in the drawer footer, Help, Find, help mode bar, the Plugins sheet's play
button, and Advanced › Reset to first launch).

Suspected cause, to check first: `tourSpot()` covers the whole screen with a
shield when the step's control isn't on screen (drawer closed mid-guide, no
updates so no "Update all", no unpinned chat), and the shields are siblings of
the layers, so taps outside the lit control are swallowed.
