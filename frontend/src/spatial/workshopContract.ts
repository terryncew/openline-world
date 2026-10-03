/**
 * Immutable build-time spatial contract for the workshop threshold.
 *
 * This module contains authored numbers and colors only. Each bundle receives
 * its own frozen copy: importing it creates no runtime channel between the
 * sandboxed illustrative town and the event-driven workshop.
 */
export const WORKSHOP_SPATIAL_CONTRACT = Object.freeze({
  id: "openline-workshop-threshold-001",
  exterior: Object.freeze({ width: 3.4, depth: 5.8, wallHeight: 2.2, totalHeight: 3.8 }),
  door: Object.freeze({ width: 1.3, height: 2.15, centerX: 0, floorY: 0, facadeZ: 2.96 }),
  orientationY: -0.12,
  floorElevation: 0,
  thresholdDepth: 1.3,
  entranceAxis: Object.freeze([0, 0, -1] as const),
  palette: Object.freeze({
    cream: "#f3ead9",
    terracotta: "#c26d4b",
    terracottaDark: "#9d5236",
    sage: "#8ba888",
    blue: "#4a6f8a",
    stone: "#cfc4ae",
    stoneDark: "#a89a80",
    wood: "#a9805a",
    woodDark: "#7d5f40",
    ink: "#3d3428",
    warm: "#e8a34f",
  }),
});

export type WorkshopSpatialContract = typeof WORKSHOP_SPATIAL_CONTRACT;
