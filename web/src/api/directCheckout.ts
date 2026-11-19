import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import type { AppLanguage } from "@/lib/language";
import type { CheckoutAnalytics } from "@/lib/analytics";
import type {
  DirectCheckoutQuote,
  DirectServiceId,
  PeriodHoroscopeType,
} from "@/lib/directServices";

export interface PeriodHoroscopeItem {
  periodType: PeriodHoroscopeType;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  language: AppLanguage;
  status: "checkout_pending" | "paid_pending" | "completed" | "failed";
  orderId: string;
  text: string | null;
  model: string | null;
  generatedAt: string | null;
  lastError: string | null;
}

export interface RecoverableDirectOrder {
  orderId: string;
  service: DirectServiceId;
  periodType: PeriodHoroscopeType | null;
  periodKey: string | null;
  periodStart: string;
  periodEnd: string;
  fulfillmentStatus: "not_started" | "pending" | "generating" | "completed" | "failed";
  lastError: string | null;
  question?: string;
  partnerName?: string;
  createdAt: string;
}

export interface ProfileHoroscopesResponse {
  today: string;
  currentMonth: { periodKey: string; periodStart: string; periodEnd: string };
  currentYear: { periodKey: string; periodStart: string; periodEnd: string };
  horoscopes: PeriodHoroscopeItem[];
  recoverableOrders: RecoverableDirectOrder[];
}

export interface DirectPartnerInput {
  name: string;
  birthDate: string;
  birthTime: string | null;
  timeUnknown: boolean;
  birthPlace: string;
  lat: number;
  lng: number;
}

export interface DirectQuoteResponse {
  quote: DirectCheckoutQuote;
  period: {
    periodType: PeriodHoroscopeType | null;
    periodKey: string | null;
    periodStart: string;
    periodEnd: string;
  };
  existingHoroscope: PeriodHoroscopeItem | null;
}

export type CreateDirectCheckoutResponse =
  | { mode: "existing_horoscope"; horoscope: PeriodHoroscopeItem }
  | { mode: "existing_order"; orderId: string; fulfillmentStatus: string }
  | {
      mode: "stars_only";
      orderId: string;
      payableCents: 0;
      appliedStars: number;
      surplusStars: number;
      periodStart: string;
      periodEnd: string;
    }
  | {
      mode: "stripe";
      orderId: string;
      url: string;
      payableCents: number;
      appliedStars: number;
    };

export interface FulfillDirectOrderResponse {
  status: "completed" | "pending" | "awaiting_payment";
  orderId: string;
  service: DirectServiceId;
  periodType: PeriodHoroscopeType | null;
  periodKey: string | null;
  periodStart: string;
  periodEnd: string;
  text: string | null;
  resultId: string | null;
  meta: {
    model: string;
    generatedAt: string;
    periodStart: string;
    periodEnd: string;
    partnerTimezone?: string;
    partnerName?: string;
    partnerBirthDate?: string;
    partnerBirthPlace?: string;
    question?: string;
    periodKey?: string;
    periodType?: PeriodHoroscopeType;
  } | null;
}

export async function listProfileHoroscopes(
  profileId: string,
  ownerDeviceId: string,
): Promise<ProfileHoroscopesResponse> {
  const fn = httpsCallable<{ profileId: string; ownerDeviceId: string }, ProfileHoroscopesResponse>(
    functions,
    "listProfileHoroscopes",
  );
  return (await fn({ profileId, ownerDeviceId })).data;
}

export async function getDirectCheckoutQuote(
  profileId: string,
  service: DirectServiceId,
): Promise<DirectQuoteResponse> {
  const fn = httpsCallable<{ profileId: string; service: DirectServiceId }, DirectQuoteResponse>(
    functions,
    "getDirectCheckoutQuote",
  );
  return (await fn({ profileId, service })).data;
}

export async function createDirectCheckout(input: {
  profileId: string;
  service: DirectServiceId;
  language: AppLanguage;
  relocationLat?: number | null;
  relocationLng?: number | null;
  question?: string;
  partner?: DirectPartnerInput;
  confirmedPayableCents?: number;
  confirmedAppliedStars?: number;
  idempotencyKey?: string;
  analytics?: CheckoutAnalytics;
}): Promise<CreateDirectCheckoutResponse> {
  const fn = httpsCallable<typeof input, CreateDirectCheckoutResponse>(
    functions,
    "createDirectCheckout",
  );
  return (await fn(input)).data;
}

export async function cancelDirectCheckout(
  orderId: string,
): Promise<{ canceled: boolean; status: string }> {
  const fn = httpsCallable<{ orderId: string }, { canceled: boolean; status: string }>(
    functions,
    "cancelDirectCheckout",
  );
  return (await fn({ orderId })).data;
}

export async function fulfillDirectOrder(orderId: string): Promise<FulfillDirectOrderResponse> {
  const fn = httpsCallable<{ orderId: string }, FulfillDirectOrderResponse>(
    functions,
    "fulfillDirectOrder",
  );
  return (await fn({ orderId })).data;
}
