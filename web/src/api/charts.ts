import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { ChartResult } from "@/types";

interface GetChartPayload {
  profileId: string;
  ownerDeviceId: string;
  houseSystem?: "placidus" | "whole-sign";
}

interface GetChartResponse {
  cached: boolean;
  chart: ChartResult;
}

export async function getChart(
  profileId: string,
  ownerDeviceId: string,
  houseSystem: "placidus" | "whole-sign" = "placidus",
): Promise<GetChartResponse> {
  const fn = httpsCallable<GetChartPayload, GetChartResponse>(
    functions,
    "getChart",
  );
  const result = await fn({ profileId, ownerDeviceId, houseSystem });
  return result.data;
}
