import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import AstrologerPanel from "@/components/AstrologerPanel";
import { Button } from "@/components/ui/button";
import { HelpBubble } from "@/components/HelpBubble";
import { getProfile } from "@/api/profiles";
import { useDeviceId } from "@/hooks/useDeviceId";

export default function AstrologerHub() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const deviceId = useDeviceId();
  const [profileName, setProfileName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getProfile(id, deviceId)
      .then((p) => {
        if (!cancelled) setProfileName(p.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, deviceId]);

  if (!id) return null;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <HelpBubble helpKey="astrologer.title">
          <h1 className="font-serif text-2xl text-[#8fb6ff]">{t("hub.title")}</h1>
        </HelpBubble>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/profile/${id}`}>{t("profile.detail.back")}</Link>
        </Button>
      </div>
      <AstrologerPanel
        profileId={id}
        profileName={profileName}
        onOpenFreeToday={() => navigate(`/profile/${id}?tab=transits`)}
      />
    </div>
  );
}
