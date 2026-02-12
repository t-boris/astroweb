import { ApiError } from "../types/index";
/**
 * Type guard for non-empty string validation.
 */
export declare function isNonEmptyString(val: unknown): val is string;
/**
 * Validates that a YYYY-MM-DD string represents a real calendar date.
 * Checks format and actual date validity (rejects e.g. 2025-02-30).
 */
export declare function isValidDate(val: string): boolean;
/**
 * Validate all required fields for profile creation.
 * Returns array of ApiError objects (empty = valid).
 */
export declare function validateCreateProfilePayload(data: unknown): ApiError[];
/**
 * Validate partial update payload — only check fields that are present.
 * ownerDeviceId is always required. At least one other field must be provided.
 * Returns array of ApiError objects (empty = valid).
 */
export declare function validateUpdateProfilePayload(data: unknown): ApiError[];
