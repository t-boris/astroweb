import type { ChartResult, Profile } from "../types";
export declare function resolveOwnedChart(params: {
    profileId: string;
    ownerDeviceId: string;
    houseSystem?: "placidus" | "koch" | "whole-sign";
    relocationLat?: number | null;
    relocationLng?: number | null;
}): Promise<{
    profile: Profile;
    chart: ChartResult;
}>;
