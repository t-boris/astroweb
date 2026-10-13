import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { HelpBubble } from "@/components/HelpBubble";
import { useAuthUser } from "@/lib/useAuthUser";
import { ensureSignedIn } from "@/lib/contentSync";
import { shouldShowSignInNotice } from "@/lib/signInNotice";

/**
 * Unobtrusive hint in the profile list (REQ-008, DEC-003): anonymous profiles
 * live only in this browser. "Sign in to save" runs Google sign-in and
 * claimProfiles, then reloads so the list comes from the account.
 */
export default function SignInNotice({ deviceId, profileCount }: { deviceId: string; profileCount: number }) {
  const { t } = useTranslation();
  const { user, ready } = useAuthUser();
  const [busy, setBusy] = useState(false);
  if (!shouldShowSignInNotice({ authReady: ready, signedIn: Boolean(user), profileCount })) return null;

  async function save() {
    setBusy(true);
    const ok = await ensureSignedIn(deviceId);
    if (ok) window.location.reload();
    else setBusy(false);
  }

  return (
    <div className="mb-3 rounded-lg border border-[#e8c969]/30 bg-[#e8c969]/5 p-2.5 text-[11px] leading-snug text-muted-foreground" data-testid="signin-notice">
      <p>{t("signInNotice.text")}</p>
      <HelpBubble helpKey="home.signInSave" actionable label={t("signInNotice.action")}>
        <Button size="xs" variant="outline" className="mt-2 w-full" onClick={() => void save()} disabled={busy}>
          {t("signInNotice.action")}
        </Button>
      </HelpBubble>
    </div>
  );
}
