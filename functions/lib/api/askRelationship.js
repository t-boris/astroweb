"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.askRelationship = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const chart_1 = require("../astro/chart");
const chartResolver_1 = require("../services/chartResolver");
const gemini_1 = require("../services/gemini");
const timezone_1 = require("../utils/timezone");
function isValidDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function isValidTime(value) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}
function parsePartnerInput(raw) {
    if (!raw || typeof raw !== "object") {
        throw new https_1.HttpsError("invalid-argument", "partner is required");
    }
    const partner = raw;
    const name = typeof partner.name === "string" ? partner.name.trim() : "";
    if (!name || name.length > 100) {
        throw new https_1.HttpsError("invalid-argument", "partner.name is invalid");
    }
    const birthDate = typeof partner.birthDate === "string" ? partner.birthDate.trim() : "";
    if (!isValidDate(birthDate)) {
        throw new https_1.HttpsError("invalid-argument", "partner.birthDate is invalid");
    }
    const timeUnknown = Boolean(partner.timeUnknown);
    const rawTime = typeof partner.birthTime === "string" ? partner.birthTime.trim() : null;
    const birthTime = timeUnknown ? null : rawTime;
    if (!timeUnknown && (!birthTime || !isValidTime(birthTime))) {
        throw new https_1.HttpsError("invalid-argument", "partner.birthTime is invalid");
    }
    const birthPlace = typeof partner.birthPlace === "string" ? partner.birthPlace.trim() : "";
    if (!birthPlace || birthPlace.length > 200) {
        throw new https_1.HttpsError("invalid-argument", "partner.birthPlace is invalid");
    }
    const lat = typeof partner.lat === "number" ? partner.lat : Number.NaN;
    const lng = typeof partner.lng === "number" ? partner.lng : Number.NaN;
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
        throw new https_1.HttpsError("invalid-argument", "partner.lat is invalid");
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
        throw new https_1.HttpsError("invalid-argument", "partner.lng is invalid");
    }
    return {
        name,
        birthDate,
        birthTime,
        timeUnknown,
        birthPlace,
        lat,
        lng,
    };
}
exports.askRelationship = (0, https_1.onCall)(async (request) => {
    const profileId = request.data?.profileId;
    const ownerDeviceId = request.data?.ownerDeviceId;
    const language = (0, gemini_1.normalizeLanguage)(request.data?.language);
    const relocationLat = request.data?.relocationLat;
    const relocationLng = request.data?.relocationLng;
    const partner = parsePartnerInput(request.data?.partner);
    if (!profileId || typeof profileId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "profileId is required");
    }
    if (!ownerDeviceId || typeof ownerDeviceId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "ownerDeviceId is required");
    }
    try {
        const { profile, chart: chartA } = await (0, chartResolver_1.resolveOwnedChart)({
            profileId,
            ownerDeviceId,
            houseSystem: "koch",
            relocationLat,
            relocationLng,
        });
        const partnerTimezone = (0, timezone_1.getTimezoneFromCoords)(partner.lat, partner.lng);
        const chartB = (0, chart_1.computeNatalChart)({
            birthDate: partner.birthDate,
            birthTime: partner.birthTime,
            timeUnknown: partner.timeUnknown,
            lat: partner.lat,
            lng: partner.lng,
            timezone: partnerTimezone,
            houseSystem: "koch",
        });
        const answer = await (0, gemini_1.generateGeminiText)((0, gemini_1.buildRelationshipPrompt)({
            chartA,
            chartB,
            personAName: profile.name,
            personBName: partner.name,
            language,
        }), {
            allowContinuation: true,
            sanitizeOutput: true,
            requireEndTag: "[END_OF_REPORT]",
        });
        v2_1.logger.info("askRelationship success", {
            profileId,
            partnerName: partner.name,
            answerLength: answer.length,
        });
        return {
            answer,
            model: (0, gemini_1.getGeminiModelName)(),
            partnerTimezone,
        };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        v2_1.logger.error("askRelationship failed", {
            profileId,
            error: error.message,
        });
        throw new https_1.HttpsError("internal", "Failed to generate relationship reading");
    }
});
