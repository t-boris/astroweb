export interface Profile {
    id: string;
    ownerDeviceId: string;
    name: string;
    birthDate: string;
    birthTime: string | null;
    timeUnknown: boolean;
    birthPlace: string;
    lat: number;
    lng: number;
    timezone: string;
    createdAt: string;
    updatedAt: string;
}
export interface CreateProfilePayload {
    ownerDeviceId: string;
    name: string;
    birthDate: string;
    birthTime: string | null;
    timeUnknown: boolean;
    birthPlace: string;
    lat: number;
    lng: number;
    timezone?: string;
}
export interface ChartPoint {
    body: string;
    lon: number;
    sign: string;
    degreeInSign: number;
    house: number | null;
}
export interface ChartHouses {
    system: "placidus" | "koch" | "whole-sign";
    cusps: number[];
    asc: number | null;
    mc: number | null;
}
export interface ChartAspect {
    a: string;
    b: string;
    type: "conjunction" | "opposition" | "trine" | "square" | "sextile";
    orb: number;
    exactness: number;
}
export interface ChartMeta {
    houseSystem: "placidus" | "koch" | "whole-sign";
    zodiac: "tropical";
    timeUsed: string | null;
    timezoneUsed: string;
}
export interface ChartResult {
    meta: ChartMeta;
    points: ChartPoint[];
    houses: ChartHouses;
    aspects: ChartAspect[];
}
export interface UpdateProfilePayload {
    ownerDeviceId: string;
    name?: string;
    birthDate?: string;
    birthTime?: string | null;
    timeUnknown?: boolean;
    birthPlace?: string;
    lat?: number;
    lng?: number;
    timezone?: string;
}
export interface ChartDocument {
    id: string;
    profileId: string;
    type: "natal";
    computedAt: string;
    inputHash: string;
    result: ChartResult;
}
export interface ApiError {
    code: string;
    message: string;
    field?: string;
}
