import { Sparkles } from "lucide-react";
import { SUBSCRIPTION_COLOURS } from "@/lib/subscriptionMark";
import { useSubscriptionText } from "@/lib/useSubscriptionText";
import type { ProfileSubscription } from "@/types";

/** The small sparkle next to a profile name; its text is the accessible name and the tooltip. */
export function SubscriptionSparkle({ subscription }: { subscription: ProfileSubscription }) {
  const text = useSubscriptionText(subscription);
  const colour = SUBSCRIPTION_COLOURS[subscription.state];
  return (
    <span role="img" aria-label={text} title={text} className="inline-flex flex-none" data-subscription={subscription.state}>
      <Sparkles className="h-3.5 w-3.5" style={{ color: colour, filter: `drop-shadow(0 0 4px ${colour})` }} aria-hidden="true" />
    </span>
  );
}

/** A pill with the full wording, for the cards of a panel wide enough to show it. */
export function SubscriptionPill({ subscription }: { subscription: ProfileSubscription }) {
  const text = useSubscriptionText(subscription);
  const colour = SUBSCRIPTION_COLOURS[subscription.state];
  return (
    <p
      className="mt-1 truncate rounded-full border px-2 py-0.5 text-[10px] leading-4"
      style={{ color: colour, borderColor: `${colour}59`, background: `${colour}14` }}
    >
      {text}
    </p>
  );
}
