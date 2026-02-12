import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { ChartResult } from "@/types";

interface GetChartPayload {
  profileId: string;
  ownerDeviceId: string;
  houseSystem?: "placidus" | "koch" | "whole-sign";
  relocationLat?: number;
  relocationLng?: number;
}

interface GetChartResponse {
  cached: boolean;
  chart: ChartResult;
}

export async function getChart(
  profileId: string,
  ownerDeviceId: string,
  houseSystem: "placidus" | "koch" | "whole-sign" = "koch",
  relocation?: { lat: number; lng: number } | null,
): Promise<GetChartResponse> {
  const fn = httpsCallable<GetChartPayload, GetChartResponse>(
    functions,
    "getChart",
  );
  const payload: GetChartPayload = {
    profileId,
    ownerDeviceId,
    houseSystem,
  };

  if (relocation) {
    payload.relocationLat = relocation.lat;
    payload.relocationLng = relocation.lng;
  }

  const result = await fn(payload);
  return result.data;
}
