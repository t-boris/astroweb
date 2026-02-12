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
exports.resolveOwnedChart = resolveOwnedChart;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const chart_1 = require("../astro/chart");
const profileService = __importStar(require("./profile"));
const chartService = __importStar(require("./chart"));
async function resolveOwnedChart(params) {
    const houseSystem = params.houseSystem ?? "koch";
    if (houseSystem !== "placidus" &&
        houseSystem !== "koch" &&
        houseSystem !== "whole-sign") {
        throw new https_1.HttpsError("invalid-argument", "Invalid house system");
    }
    const relocationLat = params.relocationLat ?? undefined;
    const relocationLng = params.relocationLng ?? undefined;
    const relocationLatValid = typeof relocationLat === "number" &&
        !Number.isNaN(relocationLat) &&
        relocationLat >= -90 &&
        relocationLat <= 90;
    const relocationLngValid = typeof relocationLng === "number" &&
        !Number.isNaN(relocationLng) &&
        relocationLng >= -180 &&
        relocationLng <= 180;
    const relocationProvided = relocationLatValid && relocationLngValid;
    let chartLat = 0;
    let chartLng = 0;
    if (relocationProvided) {
        chartLat = relocationLat;
        chartLng = relocationLng;
    }
    else if (relocationLat !== undefined || relocationLng !== undefined) {
        v2_1.logger.warn("resolveOwnedChart invalid relocation fallback to natal", {
            profileId: params.profileId,
            relocationLat,
            relocationLng,
        });
    }
    const profile = await profileService.getProfileById(params.profileId);
    if (!profile) {
        throw new https_1.HttpsError("not-found", "Profile not found");
    }
    if (profile.ownerDeviceId !== params.ownerDeviceId) {
        throw new https_1.HttpsError("permission-denied", "Access denied");
    }
    if (!relocationProvided) {
        chartLat = profile.lat;
        chartLng = profile.lng;
    }
    const inputHash = chartService.computeInputHash({
        birthDate: profile.birthDate,
        birthTime: profile.birthTime,
        lat: chartLat,
        lng: chartLng,
        timezone: profile.timezone,
        houseSystem,
    });
    const cached = await chartService.findCachedChart(params.profileId, inputHash);
    if (cached) {
        return {
            profile,
            chart: cached.result,
        };
    }
    const chart = (0, chart_1.computeNatalChart)({
        birthDate: profile.birthDate,
        birthTime: profile.birthTime,
        timeUnknown: profile.timeUnknown,
        lat: chartLat,
        lng: chartLng,
        timezone: profile.timezone,
        houseSystem,
    });
    await chartService.storeChart(params.profileId, inputHash, chart);
    return {
        profile,
        chart,
    };
}
