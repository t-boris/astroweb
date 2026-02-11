// Cloud Functions Gen 2 — required for Node.js 22 runtime
import { onCall } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";

initializeApp();

export const hello = onCall(() => {
  return { message: "Hello from AstroWeb!" };
});
