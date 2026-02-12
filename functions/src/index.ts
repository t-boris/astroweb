// Cloud Functions Gen 2 — required for Node.js 22 runtime
import { initializeApp } from "firebase-admin/app";

initializeApp();

export { createProfile } from "./api/createProfile";
export { listProfiles } from "./api/listProfiles";
export { getProfile } from "./api/getProfile";
