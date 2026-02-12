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
exports.createProfile = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const profile_1 = require("../validation/profile");
const profileService = __importStar(require("../services/profile"));
const timezone_1 = require("../utils/timezone");
exports.createProfile = (0, https_1.onCall)(async (request) => {
    const { data } = request;
    // Validate input
    const errors = (0, profile_1.validateCreateProfilePayload)(data);
    if (errors.length > 0) {
        throw new https_1.HttpsError("invalid-argument", errors[0].message);
    }
    v2_1.logger.info("createProfile called", { name: data?.name });
    try {
        // Auto-resolve timezone from coordinates if not provided
        if (!data.timezone) {
            data.timezone = (0, timezone_1.getTimezoneFromCoords)(data.lat, data.lng);
        }
        const profile = await profileService.createProfile(data);
        return profile;
    }
    catch (error) {
        v2_1.logger.error("createProfile failed", { error: error.message });
        throw new https_1.HttpsError("internal", "An unexpected error occurred");
    }
});
