import { ChartResult } from '../types/index';
/** Input parameters for computing a natal chart */
export interface ComputeChartInput {
    birthDate: string;
    birthTime: string | null;
    timeUnknown: boolean;
    lat: number;
    lng: number;
    timezone: string;
    houseSystem: 'placidus' | 'koch' | 'whole-sign';
}
/**
 * Compute a full natal chart from birth data.
 *
 * Pipeline: local time -> UTC -> Julian Day -> planetary positions ->
 * house cusps -> house placement -> aspect detection -> ChartResult.
 *
 * When timeUnknown is true, noon is used as the default birth time and
 * house assignments, ASC, and MC are set to null.
 */
export declare function computeNatalChart(input: ComputeChartInput): ChartResult;
