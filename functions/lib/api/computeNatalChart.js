"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeNatalChart = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const chart_1 = require("../astro/chart");
const profileService = __importStar(require("../services/profile"));
const chartService = __importStar(require("../services/chart"));
/**
 * computeNatalChart Cloud Function — computes a natal chart for a profile.
 *
 * Validates input, enforces deviceId ownership, checks cache, computes
 * chart via astro/chart.ts, stores result in Firestore, and returns
 * the ChartResult.
 */
exports.computeNatalChart = (0, https_1.onCall)(async (request) => {
    const { data } = request;
    // ---- Validate input ----
    const profileId = data?.profileId;
    const ownerDeviceId = data?.ownerDeviceId;
    const houseSystem = data?.houseSystem ?? "koch";
    const relocationLat = data?.relocationLat ?? undefined;
    const relocationLng = data?.relocationLng ?? undefined;
    if (!profileId || typeof profileId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "profileId is required");
    }
    if (!ownerDeviceId || typeof ownerDeviceId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "ownerDeviceId is required");
    }
    if (houseSystem !== "placidus" &&
        houseSystem !== "koch" &&
        houseSystem !== "whole-sign") {
        throw new https_1.HttpsError("invalid-argument", "Invalid house system");
    }
    const relocationLatValid = typeof relocationLat === "number" &&
        !Number.isNaN(relocationLat) &&
        relocationLat >= -90 &&
        relocationLat <= 90;
    const relocationLngValid = typeof relocationLng === "number" &&
        !Number.isNaN(relocationLng) &&
        relocationLng >= -180 &&
        relocationLng <= 180;
    const relocationProvided = relocationLatValid && relocationLngValid;
    if ((relocationLat !== undefined || relocationLng !== undefined) &&
        !relocationProvided) {
        v2_1.logger.warn("computeNatalChart invalid relocation fallback to natal", {
            profileId,
            relocationLat,
            relocationLng,
        });
    }
    v2_1.logger.info("computeNatalChart called", {
        profileId,
        houseSystem,
        relocation: relocationProvided,
    });
    try {
        // ---- Ownership check ----
        const profile = await profileService.getProfileById(profileId);
        if (!profile) {
            throw new https_1.HttpsError("not-found", "Profile not found");
        }
        if (profile.ownerDeviceId !== ownerDeviceId) {
            throw new https_1.HttpsError("permission-denied", "Access denied");
        }
        // ---- Cache check ----
        const chartLat = relocationProvided ? relocationLat : profile.lat;
        const chartLng = relocationProvided ? relocationLng : profile.lng;
        const inputHash = chartService.computeInputHash({
            birthDate: profile.birthDate,
            birthTime: profile.birthTime,
            lat: chartLat,
            lng: chartLng,
            timezone: profile.timezone,
            houseSystem,
        });
        const cached = await chartService.findCachedChart(profileId, inputHash);
        if (cached) {
            v2_1.logger.info("computeNatalChart cache hit", { profileId, cached: true });
            return cached.result;
        }
        // ---- Compute ----
        const result = (0, chart_1.computeNatalChart)({
            birthDate: profile.birthDate,
            birthTime: profile.birthTime,
            timeUnknown: profile.timeUnknown,
            lat: chartLat,
            lng: chartLng,
            timezone: profile.timezone,
            houseSystem,
        });
        // ---- Store ----
        await chartService.storeChart(profileId, inputHash, result);
        // ---- Return ----
        return result;
    }
    catch (error) {
        // Re-throw HttpsError as-is
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        v2_1.logger.error("computeNatalChart failed", { profileId, error: error.message });
        throw new https_1.HttpsError("internal", "Failed to compute chart");
    }
});
