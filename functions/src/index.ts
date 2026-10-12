// Cloud Functions Gen 2 — required for Node.js 22 runtime
import { initializeApp } from "firebase-admin/app";

initializeApp();

export { createProfile } from "./api/createProfile";
export { claimProfiles } from "./api/claimProfiles";
export { listProfiles } from "./api/listProfiles";
export { getProfile } from "./api/getProfile";
export { updateProfile } from "./api/updateProfile";
export { deleteProfile } from "./api/deleteProfile";
export { archiveProfile } from "./api/archiveProfile";
export { computeNatalChart } from "./api/computeNatalChart";
export { getChart } from "./api/getChart";
export { deepenInterpretation } from "./api/deepenInterpretation";
export { askOracle } from "./api/askOracle";
export { askRelationship } from "./api/askRelationship";
export { getForecast } from "./api/getForecast";
export { getWallet } from "./api/getWallet";

// Personal Astrologer — Phase 1 (dossier)
export {
  getDossierData,
  updateDossier,
  setDossierInterests,
  setDossierConsent,
  addDossierFact,
  confirmDossierFact,
  deleteDossierFact,
  forgetDossierData,
  exportUserData,
} from "./api/dossier";

// Personal Astrologer — Phase 2 (letter engine)
export { generateLetterNow } from "./api/generateLetterNow";
export { processLetterJob } from "./api/processLetterJob";
export { scheduleLetters } from "./api/scheduleLetters";

// Personal Astrologer — Phase 3 (delivery)
export {
  listLetters,
  getLetter,
  markLetterRead,
  setLetterFeedback,
  answerLetterQuestion,
  askInLetter,
} from "./api/letters";

// Personal Astrologer — push notifications
export { registerPushSubscription, unregisterPushSubscription } from "./api/pushSubscription";

// Personal Astrologer — Phase 4 (billing)
export { subscribeAstrologer } from "./api/subscribeAstrologer";
export {
  getAstrologerStatus,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  setSubscriptionChannels,
} from "./api/astrologerSubscription";
export { downloadPremiumPdf } from "./api/downloadPremiumPdf";
export { enqueuePremiumPdf } from "./api/enqueuePremiumPdf";
export { getPremiumPdfJob } from "./api/getPremiumPdfJob";

// Stripe / Monetization
export { createCheckoutSession } from "./api/createCheckoutSession";
export { unlockFeature } from "./api/unlockFeature";
export { stripeWebhook } from "./api/stripeWebhook";
export { processPdfJob } from "./api/processPdfJob";

// Per-profile server-side content (REQ-002..005, REQ-007, REQ-009)
export { getProfileContent, uploadLocalContent, deleteProfileContentItem } from "./api/profileContent";

// Admin (gated to t.boris@gmail.com)
export {
  adminListProfiles,
  adminListPurchases,
  adminGrantTokens,
  adminListUsers,
  adminGrantToWallet,
  adminStats,
} from "./api/admin";
