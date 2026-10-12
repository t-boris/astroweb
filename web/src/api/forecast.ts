import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { AppLanguage } from "@/lib/language";

export interface ForecastResult {
  text: string;
  date: string;
  model: string;
}

export async function getForecast(payload: {
  profileId: string;
  ownerDeviceId: string;
  language?: AppLanguage;
}): Promise<ForecastResult> {
  const fn = httpsCallable<typeof payload, ForecastResult>(functions, "getForecast");
  const r = await fn(payload);
  return r.data;
}
