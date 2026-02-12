import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { Profile, CreateProfilePayload, UpdateProfilePayload } from "@/types";

export async function createProfile(payload: CreateProfilePayload): Promise<Profile> {
  const fn = httpsCallable<CreateProfilePayload, Profile>(functions, "createProfile");
  const result = await fn(payload);
  return result.data;
}

export async function listProfiles(ownerDeviceId: string): Promise<Profile[]> {
  const fn = httpsCallable<{ ownerDeviceId: string }, { profiles: Profile[] }>(functions, "listProfiles");
  const result = await fn({ ownerDeviceId });
  return result.data.profiles;
}

export async function getProfile(profileId: string, ownerDeviceId: string): Promise<Profile> {
  const fn = httpsCallable<{ profileId: string; ownerDeviceId: string }, Profile>(functions, "getProfile");
  const result = await fn({ profileId, ownerDeviceId });
  return result.data;
}

export async function updateProfile(profileId: string, payload: UpdateProfilePayload): Promise<Profile> {
  const fn = httpsCallable<UpdateProfilePayload & { profileId: string }, Profile>(functions, "updateProfile");
  const result = await fn({ profileId, ...payload });
  return result.data;
}

export async function deleteProfile(profileId: string, ownerDeviceId: string): Promise<void> {
  const fn = httpsCallable<{ profileId: string; ownerDeviceId: string }, void>(functions, "deleteProfile");
  await fn({ profileId, ownerDeviceId });
}
