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
exports.getProfile = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const profileService = __importStar(require("../services/profile"));
exports.getProfile = (0, https_1.onCall)(async (request) => {
    const { data } = request;
    // Validate inputs
    if (typeof data?.profileId !== "string" ||
        data.profileId.trim().length === 0) {
        throw new https_1.HttpsError("invalid-argument", "profileId is required");
    }
    if (typeof data?.ownerDeviceId !== "string" ||
        data.ownerDeviceId.trim().length === 0) {
        throw new https_1.HttpsError("invalid-argument", "ownerDeviceId is required");
    }
    v2_1.logger.info("getProfile called", { profileId: data.profileId });
    try {
        const profile = await profileService.getProfileById(data.profileId);
        if (!profile) {
            throw new https_1.HttpsError("not-found", "Profile not found");
        }
        // Ownership check
        if (profile.ownerDeviceId !== data.ownerDeviceId) {
            throw new https_1.HttpsError("permission-denied", "Access denied");
        }
        return profile;
    }
    catch (error) {
        // Re-throw HttpsError instances as-is
        if (error instanceof https_1.HttpsError) {
            throw error;
        }
        v2_1.logger.error("getProfile failed", { profileId: data.profileId, error: error.message });
        throw new https_1.HttpsError("internal", "An unexpected error occurred");
    }
});
