import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

const ADMIN_EMAIL = "t.boris@gmail.com";

/** Throws unless the caller is the verified admin account. Returns the admin's email. */
export function assertAdmin(request: CallableRequest): string {
  const token = request.auth?.token as { email?: string; email_verified?: boolean } | undefined;
  if (!request.auth || token?.email !== ADMIN_EMAIL || token?.email_verified !== true) {
    throw new HttpsError("permission-denied", "Admin access required");
  }
  return ADMIN_EMAIL;
}
