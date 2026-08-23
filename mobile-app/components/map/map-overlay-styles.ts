// Shared layout constants for the floating controls (legend, GPS/route
// buttons, layers menu) that appear on top of a MapView. Used by both
// view-map.tsx (project map view) and InsertLocationModal.tsx (point
// picker), so a spacing/shadow tweak only needs to happen in one place.
export const MAP_OVERLAY_MARGIN = 16;

// Vertical gap between stacked floating buttons on the same side (e.g. GPS
// button followed by the route/fit-to-data button below it).
export const MAP_OVERLAY_BUTTON_GAP = 60;

// Extra offset (on top of the safe-area inset) applied to the legend and
// its toggle button so they clear the native Google Maps compass, which
// otherwise ends up partially overlapped with the legend's top edge.
export const MAP_LEGEND_TOP_OFFSET = 46;

export const MAP_OVERLAY_SHADOW = {
  elevation: 4,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 4,
} as const;
