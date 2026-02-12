"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.angularDifference = angularDifference;
exports.detectAspect = detectAspect;
exports.detectAllAspects = detectAllAspects;
const constants_1 = require("./constants");
/**
 * Compute the angular difference between two ecliptic longitudes.
 * Handles the 0/360 wrap-around correctly, always returning a value in [0, 180].
 */
function angularDifference(lon1, lon2) {
    const raw = Math.abs(lon1 - lon2) % 360;
    return raw > 180 ? 360 - raw : raw;
}
/**
 * Detect whether two points form a major aspect.
 * Returns the aspect details if found, or null if no aspect within orb.
 */
function detectAspect(nameA, lonA, nameB, lonB) {
    const diff = angularDifference(lonA, lonB);
    for (const def of constants_1.ASPECT_DEFINITIONS) {
        const deviation = Math.abs(diff - def.angle);
        if (deviation <= def.orb) {
            return {
                a: nameA,
                b: nameB,
                type: def.type,
                orb: Math.round(deviation * 100) / 100,
                exactness: Math.round((1 - deviation / def.orb) * 100) / 100,
            };
        }
    }
    return null;
}
/**
 * Detect all major aspects among an array of chart points.
 * Uses triangular iteration (i < j) to avoid duplicate pairs.
 * Points should include all 10 planets plus ASC and MC (12 points, 66 pairs).
 * Results are sorted by exactness descending (most exact first).
 */
function detectAllAspects(points) {
    const aspects = [];
    for (let i = 0; i < points.length - 1; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const aspect = detectAspect(points[i].name, points[i].lon, points[j].name, points[j].lon);
            if (aspect !== null) {
                aspects.push(aspect);
            }
        }
    }
    // Sort by exactness descending (most exact first)
    aspects.sort((a, b) => b.exactness - a.exactness);
    return aspects;
}
