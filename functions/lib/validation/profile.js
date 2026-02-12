"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNonEmptyString = isNonEmptyString;
exports.isValidDate = isValidDate;
exports.validateCreateProfilePayload = validateCreateProfilePayload;
exports.validateUpdateProfilePayload = validateUpdateProfilePayload;
/**
 * Type guard for non-empty string validation.
 */
function isNonEmptyString(val) {
    return typeof val === "string" && val.trim().length > 0;
}
/**
 * Validates that a YYYY-MM-DD string represents a real calendar date.
 * Checks format and actual date validity (rejects e.g. 2025-02-30).
 */
function isValidDate(val) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(val)) {
        return false;
    }
    const [yearStr, monthStr, dayStr] = val.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    // Month must be 1-12, day must be at least 1
    if (month < 1 || month > 12 || day < 1) {
        return false;
    }
    // Use Date constructor to validate (months are 0-indexed)
    const date = new Date(year, month - 1, day);
    return (date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day);
}
/**
 * Validates HH:mm format and value range (hours 0-23, minutes 0-59).
 */
function isValidTime(val) {
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(val)) {
        return false;
    }
    const [hourStr, minuteStr] = val.split(":");
    const hours = parseInt(hourStr, 10);
    const minutes = parseInt(minuteStr, 10);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}
/**
 * Validate all required fields for profile creation.
 * Returns array of ApiError objects (empty = valid).
 */
function validateCreateProfilePayload(data) {
    const errors = [];
    if (typeof data !== "object" || data === null) {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "Payload must be a non-null object",
        });
        return errors;
    }
    const payload = data;
    // ownerDeviceId: must be non-empty string
    if (!isNonEmptyString(payload.ownerDeviceId)) {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "ownerDeviceId must be a non-empty string",
            field: "ownerDeviceId",
        });
    }
    // name: must be non-empty string, max 100 chars
    if (!isNonEmptyString(payload.name)) {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "name must be a non-empty string",
            field: "name",
        });
    }
    else if (payload.name.length > 100) {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "name must be at most 100 characters",
            field: "name",
        });
    }
    // birthDate: must be string matching YYYY-MM-DD and a valid date
    if (!isNonEmptyString(payload.birthDate)) {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "birthDate must be a non-empty string in YYYY-MM-DD format",
            field: "birthDate",
        });
    }
    else if (!isValidDate(payload.birthDate)) {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "birthDate must be a valid date in YYYY-MM-DD format",
            field: "birthDate",
        });
    }
    // birthTime: if provided and not null, must match HH:mm format
    if (payload.birthTime !== undefined && payload.birthTime !== null) {
        if (typeof payload.birthTime !== "string" || !isValidTime(payload.birthTime)) {
            errors.push({
                code: "INVALID_PAYLOAD",
                message: "birthTime must be a string in HH:mm format (or null)",
                field: "birthTime",
            });
        }
    }
    // timeUnknown: must be boolean
    if (typeof payload.timeUnknown !== "boolean") {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "timeUnknown must be a boolean",
            field: "timeUnknown",
        });
    }
    // birthPlace: must be non-empty string, max 200 chars
    if (!isNonEmptyString(payload.birthPlace)) {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "birthPlace must be a non-empty string",
            field: "birthPlace",
        });
    }
    else if (payload.birthPlace.length > 200) {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "birthPlace must be at most 200 characters",
            field: "birthPlace",
        });
    }
    // lat: must be number, range -90 to 90
    if (typeof payload.lat !== "number" || Number.isNaN(payload.lat)) {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "lat must be a number",
            field: "lat",
        });
    }
    else if (payload.lat < -90 || payload.lat > 90) {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "lat must be between -90 and 90",
            field: "lat",
        });
    }
    // lng: must be number, range -180 to 180
    if (typeof payload.lng !== "number" || Number.isNaN(payload.lng)) {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "lng must be a number",
            field: "lng",
        });
    }
    else if (payload.lng < -180 || payload.lng > 180) {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "lng must be between -180 and 180",
            field: "lng",
        });
    }
    // timezone: optional, but if provided must be non-empty string
    if (payload.timezone !== undefined && !isNonEmptyString(payload.timezone)) {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "timezone must be a non-empty string",
            field: "timezone",
        });
    }
    return errors;
}
/**
 * Validate partial update payload — only check fields that are present.
 * ownerDeviceId is always required. At least one other field must be provided.
 * Returns array of ApiError objects (empty = valid).
 */
function validateUpdateProfilePayload(data) {
    const errors = [];
    if (typeof data !== "object" || data === null) {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "Payload must be a non-null object",
        });
        return errors;
    }
    const payload = data;
    // ownerDeviceId: REQUIRED (always needed for ownership)
    if (!isNonEmptyString(payload.ownerDeviceId)) {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "ownerDeviceId must be a non-empty string",
            field: "ownerDeviceId",
        });
    }
    // Check that at least one updatable field is provided
    const updatableFields = [
        "name",
        "birthDate",
        "birthTime",
        "timeUnknown",
        "birthPlace",
        "lat",
        "lng",
        "timezone",
    ];
    const hasUpdatableField = updatableFields.some((field) => payload[field] !== undefined);
    if (!hasUpdatableField) {
        errors.push({
            code: "INVALID_PAYLOAD",
            message: "At least one field besides ownerDeviceId must be provided for update",
        });
    }
    // Validate each present field with the same rules as create
    if (payload.name !== undefined) {
        if (!isNonEmptyString(payload.name)) {
            errors.push({
                code: "INVALID_PAYLOAD",
                message: "name must be a non-empty string",
                field: "name",
            });
        }
        else if (payload.name.length > 100) {
            errors.push({
                code: "INVALID_PAYLOAD",
                message: "name must be at most 100 characters",
                field: "name",
            });
        }
    }
    if (payload.birthDate !== undefined) {
        if (!isNonEmptyString(payload.birthDate)) {
            errors.push({
                code: "INVALID_PAYLOAD",
                message: "birthDate must be a non-empty string in YYYY-MM-DD format",
                field: "birthDate",
            });
        }
        else if (!isValidDate(payload.birthDate)) {
            errors.push({
                code: "INVALID_PAYLOAD",
                message: "birthDate must be a valid date in YYYY-MM-DD format",
                field: "birthDate",
            });
        }
    }
    if (payload.birthTime !== undefined && payload.birthTime !== null) {
        if (typeof payload.birthTime !== "string" || !isValidTime(payload.birthTime)) {
            errors.push({
                code: "INVALID_PAYLOAD",
                message: "birthTime must be a string in HH:mm format (or null)",
                field: "birthTime",
            });
        }
    }
    if (payload.timeUnknown !== undefined) {
        if (typeof payload.timeUnknown !== "boolean") {
            errors.push({
                code: "INVALID_PAYLOAD",
                message: "timeUnknown must be a boolean",
                field: "timeUnknown",
            });
        }
    }
    if (payload.birthPlace !== undefined) {
        if (!isNonEmptyString(payload.birthPlace)) {
            errors.push({
                code: "INVALID_PAYLOAD",
                message: "birthPlace must be a non-empty string",
                field: "birthPlace",
            });
        }
        else if (payload.birthPlace.length > 200) {
            errors.push({
                code: "INVALID_PAYLOAD",
                message: "birthPlace must be at most 200 characters",
                field: "birthPlace",
            });
        }
    }
    if (payload.lat !== undefined) {
        if (typeof payload.lat !== "number" || Number.isNaN(payload.lat)) {
            errors.push({
                code: "INVALID_PAYLOAD",
                message: "lat must be a number",
                field: "lat",
            });
        }
        else if (payload.lat < -90 || payload.lat > 90) {
            errors.push({
                code: "INVALID_PAYLOAD",
                message: "lat must be between -90 and 90",
                field: "lat",
            });
        }
    }
    if (payload.lng !== undefined) {
        if (typeof payload.lng !== "number" || Number.isNaN(payload.lng)) {
            errors.push({
                code: "INVALID_PAYLOAD",
                message: "lng must be a number",
                field: "lng",
            });
        }
        else if (payload.lng < -180 || payload.lng > 180) {
            errors.push({
                code: "INVALID_PAYLOAD",
                message: "lng must be between -180 and 180",
                field: "lng",
            });
        }
    }
    if (payload.timezone !== undefined) {
        if (!isNonEmptyString(payload.timezone)) {
            errors.push({
                code: "INVALID_PAYLOAD",
                message: "timezone must be a non-empty string",
                field: "timezone",
            });
        }
    }
    return errors;
}
