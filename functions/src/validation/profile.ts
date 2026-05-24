import { ApiError } from "../types/index";

/**
 * Type guard for non-empty string validation.
 */
export function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

/**
 * Validates that a YYYY-MM-DD string represents a real calendar date.
 * Checks format and actual date validity (rejects e.g. 2025-02-30).
 */
export function isValidDate(val: string): boolean {
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
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Validates HH:mm format and value range (hours 0-23, minutes 0-59).
 */
function isValidTime(val: string): boolean {
  const timeRegex = /^\d{2}:\d{2}$/;
  if (!timeRegex.test(val)) {
    return false;
  }

  const [hourStr, minuteStr] = val.split(":");
  const hours = parseInt(hourStr, 10);
  const minutes = parseInt(minuteStr, 10);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function validateLatitude(payload: Record<string, unknown>, field: string): ApiError[] {
  const value = payload[field];
  if (typeof value !== "number" || Number.isNaN(value)) {
    return [{
      code: "INVALID_PAYLOAD",
      message: `${field} must be a number`,
      field,
    }];
  }

  if (value < -90 || value > 90) {
    return [{
      code: "INVALID_PAYLOAD",
      message: `${field} must be between -90 and 90`,
      field,
    }];
  }

  return [];
}

function validateLongitude(payload: Record<string, unknown>, field: string): ApiError[] {
  const value = payload[field];
  if (typeof value !== "number" || Number.isNaN(value)) {
    return [{
      code: "INVALID_PAYLOAD",
      message: `${field} must be a number`,
      field,
    }];
  }

  if (value < -180 || value > 180) {
    return [{
      code: "INVALID_PAYLOAD",
      message: `${field} must be between -180 and 180`,
      field,
    }];
  }

  return [];
}

/**
 * Validate all required fields for profile creation.
 * Returns array of ApiError objects (empty = valid).
 */
export function validateCreateProfilePayload(data: unknown): ApiError[] {
  const errors: ApiError[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push({
      code: "INVALID_PAYLOAD",
      message: "Payload must be a non-null object",
    });
    return errors;
  }

  const payload = data as Record<string, unknown>;

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
  } else if ((payload.name as string).length > 100) {
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
  } else if (!isValidDate(payload.birthDate as string)) {
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
  } else if ((payload.birthPlace as string).length > 200) {
    errors.push({
      code: "INVALID_PAYLOAD",
      message: "birthPlace must be at most 200 characters",
      field: "birthPlace",
    });
  }

  // lat: must be number, range -90 to 90
  errors.push(...validateLatitude(payload, "lat"));

  // lng: must be number, range -180 to 180
  errors.push(...validateLongitude(payload, "lng"));

  // timezone: optional, but if provided must be non-empty string
  if (payload.timezone !== undefined && !isNonEmptyString(payload.timezone)) {
    errors.push({
      code: "INVALID_PAYLOAD",
      message: "timezone must be a non-empty string",
      field: "timezone",
    });
  }

  if (payload.relocationEnabled !== undefined && typeof payload.relocationEnabled !== "boolean") {
    errors.push({
      code: "INVALID_PAYLOAD",
      message: "relocationEnabled must be a boolean",
      field: "relocationEnabled",
    });
  }

  if (payload.currentPlace !== undefined) {
    if (!isNonEmptyString(payload.currentPlace)) {
      errors.push({
        code: "INVALID_PAYLOAD",
        message: "currentPlace must be a non-empty string",
        field: "currentPlace",
      });
    } else if ((payload.currentPlace as string).length > 200) {
      errors.push({
        code: "INVALID_PAYLOAD",
        message: "currentPlace must be at most 200 characters",
        field: "currentPlace",
      });
    }
  }

  if (payload.currentLat !== undefined) {
    errors.push(...validateLatitude(payload, "currentLat"));
  }

  if (payload.currentLng !== undefined) {
    errors.push(...validateLongitude(payload, "currentLng"));
  }

  return errors;
}

/**
 * Validate partial update payload — only check fields that are present.
 * ownerDeviceId is always required. At least one other field must be provided.
 * Returns array of ApiError objects (empty = valid).
 */
export function validateUpdateProfilePayload(data: unknown): ApiError[] {
  const errors: ApiError[] = [];

  if (typeof data !== "object" || data === null) {
    errors.push({
      code: "INVALID_PAYLOAD",
      message: "Payload must be a non-null object",
    });
    return errors;
  }

  const payload = data as Record<string, unknown>;

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
    "relocationEnabled",
    "currentPlace",
    "currentLat",
    "currentLng",
  ];
  const hasUpdatableField = updatableFields.some(
    (field) => payload[field] !== undefined
  );

  if (!hasUpdatableField) {
    errors.push({
      code: "INVALID_PAYLOAD",
      message:
        "At least one field besides ownerDeviceId must be provided for update",
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
    } else if ((payload.name as string).length > 100) {
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
    } else if (!isValidDate(payload.birthDate as string)) {
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
    } else if ((payload.birthPlace as string).length > 200) {
      errors.push({
        code: "INVALID_PAYLOAD",
        message: "birthPlace must be at most 200 characters",
        field: "birthPlace",
      });
    }
  }

  if (payload.lat !== undefined) {
    errors.push(...validateLatitude(payload, "lat"));
  }

  if (payload.lng !== undefined) {
    errors.push(...validateLongitude(payload, "lng"));
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

  if (payload.relocationEnabled !== undefined) {
    if (typeof payload.relocationEnabled !== "boolean") {
      errors.push({
        code: "INVALID_PAYLOAD",
        message: "relocationEnabled must be a boolean",
        field: "relocationEnabled",
      });
    }
  }

  if (payload.currentPlace !== undefined) {
    if (!isNonEmptyString(payload.currentPlace)) {
      errors.push({
        code: "INVALID_PAYLOAD",
        message: "currentPlace must be a non-empty string",
        field: "currentPlace",
      });
    } else if ((payload.currentPlace as string).length > 200) {
      errors.push({
        code: "INVALID_PAYLOAD",
        message: "currentPlace must be at most 200 characters",
        field: "currentPlace",
      });
    }
  }

  if (payload.currentLat !== undefined) {
    errors.push(...validateLatitude(payload, "currentLat"));
  }

  if (payload.currentLng !== undefined) {
    errors.push(...validateLongitude(payload, "currentLng"));
  }

  return errors;
}
