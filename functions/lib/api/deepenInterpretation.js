"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepenInterpretation = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const chartResolver_1 = require("../services/chartResolver");
const gemini_1 = require("../services/gemini");
exports.deepenInterpretation = (0, https_1.onCall)(async (request) => {
    const profileId = request.data?.profileId;
    const ownerDeviceId = request.data?.ownerDeviceId;
    const focusTopic = request.data?.focusTopic;
    const baseInterpretation = request.data?.baseInterpretation;
    const language = (0, gemini_1.normalizeLanguage)(request.data?.language);
    const relocationLat = request.data?.relocationLat;
    const relocationLng = request.data?.relocationLng;
    if (!profileId || typeof profileId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "profileId is required");
    }
    if (!ownerDeviceId || typeof ownerDeviceId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "ownerDeviceId is required");
    }
    if (!focusTopic || typeof focusTopic !== "string") {
        throw new https_1.HttpsError("invalid-argument", "focusTopic is required");
    }
    if (!baseInterpretation || typeof baseInterpretation !== "string") {
        throw new https_1.HttpsError("invalid-argument", "baseInterpretation is required");
    }
    try {
        const { chart } = await (0, chartResolver_1.resolveOwnedChart)({
            profileId,
            ownerDeviceId,
            relocationLat,
            relocationLng,
        });
        const text = await (0, gemini_1.generateGeminiText)((0, gemini_1.buildDeepInterpretationPrompt)({
            chart,
            focusTopic: focusTopic.trim().slice(0, 200),
            baseInterpretation: baseInterpretation.trim().slice(0, 2000),
            language,
        }), {
            allowContinuation: true,
            sanitizeOutput: true,
            requireEndTag: "[END_OF_REPORT]",
        });
        return {
            text,
            model: (0, gemini_1.getGeminiModelName)(),
        };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        v2_1.logger.error("deepenInterpretation failed", {
            profileId,
            error: error.message,
        });
        throw new https_1.HttpsError("internal", "Failed to generate deep interpretation");
    }
});
