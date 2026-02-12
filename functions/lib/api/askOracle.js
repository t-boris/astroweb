"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.askOracle = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const chartResolver_1 = require("../services/chartResolver");
const gemini_1 = require("../services/gemini");
exports.askOracle = (0, https_1.onCall)(async (request) => {
    const profileId = request.data?.profileId;
    const ownerDeviceId = request.data?.ownerDeviceId;
    const question = request.data?.question;
    const language = (0, gemini_1.normalizeLanguage)(request.data?.language);
    const relocationLat = request.data?.relocationLat;
    const relocationLng = request.data?.relocationLng;
    if (!profileId || typeof profileId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "profileId is required");
    }
    if (!ownerDeviceId || typeof ownerDeviceId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "ownerDeviceId is required");
    }
    if (!question || typeof question !== "string") {
        throw new https_1.HttpsError("invalid-argument", "question is required");
    }
    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "question cannot be empty");
    }
    if (trimmedQuestion.length > 1000) {
        throw new https_1.HttpsError("invalid-argument", "question is too long");
    }
    try {
        const { chart } = await (0, chartResolver_1.resolveOwnedChart)({
            profileId,
            ownerDeviceId,
            relocationLat,
            relocationLng,
        });
        const basePrompt = (0, gemini_1.buildOraclePrompt)({
            chart,
            question: trimmedQuestion,
            language,
        });
        v2_1.logger.info("askOracle request", {
            profileId,
            questionLength: trimmedQuestion.length,
            language,
        });
        const answer = await (0, gemini_1.generateGeminiText)(basePrompt, {
            allowContinuation: true,
            sanitizeOutput: true,
            requireEndTag: "[END_OF_REPORT]",
        });
        v2_1.logger.info("askOracle success", {
            profileId,
            answerLength: answer.length,
            answerWords: answer.split(/\s+/).filter(Boolean).length,
        });
        return {
            answer,
            model: (0, gemini_1.getGeminiModelName)(),
        };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        v2_1.logger.error("askOracle failed", {
            profileId,
            error: error.message,
        });
        throw new https_1.HttpsError("internal", "Failed to answer oracle question");
    }
});
