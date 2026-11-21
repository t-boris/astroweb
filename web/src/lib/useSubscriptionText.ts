import { useTranslation } from "react-i18next";
import { cadenceTextKey } from "@/lib/subscriptionMark";
import type { ProfileSubscription } from "@/types";

/** "Astrologer · every 2 days", "Astrologer · until 5 Dec", "Astrologer · paused" or "Astrologer · payment failed". */
export function useSubscriptionText(subscription: ProfileSubscription): string {
  const { t, i18n } = useTranslation();
  switch (subscription.state) {
    case "active": {
      const key = cadenceTextKey(subscription.cadence);
      return key ? t("home.subscription.active", { cadence: t(key) }) : t("home.subscription.astrologer");
    }
    case "ending": {
      const date = subscription.until
        ? new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short" }).format(new Date(subscription.until))
        : "";
      return date ? t("home.subscription.ending", { date }) : t("home.subscription.astrologer");
    }
    case "paused":
      return t("home.subscription.paused");
    case "past_due":
      return t("home.subscription.pastDue");
  }
}
