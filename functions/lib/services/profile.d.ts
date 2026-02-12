import { Profile, CreateProfilePayload } from "../types/index";
/**
 * Create a new profile document with auto-generated ID.
 * Sets createdAt and updatedAt to current ISO timestamp.
 */
export declare function createProfile(payload: CreateProfilePayload): Promise<Profile>;
/**
 * Fetch a profile by document ID.
 * Returns Profile or null if not found.
 */
export declare function getProfileById(id: string): Promise<Profile | null>;
/**
 * Query profiles owned by a specific device.
 * Returns array ordered by createdAt descending (newest first).
 */
export declare function listProfilesByOwner(ownerDeviceId: string): Promise<Profile[]>;
/**
 * Update only provided fields on a profile document.
 * Always sets updatedAt to current timestamp.
 * Throws if document doesn't exist.
 */
export declare function updateProfile(id: string, updates: Partial<Omit<Profile, "id" | "ownerDeviceId" | "createdAt">>): Promise<Profile>;
/**
 * Delete a profile document by ID.
 * Idempotent — no error if already deleted.
 */
export declare function deleteProfile(id: string): Promise<void>;
