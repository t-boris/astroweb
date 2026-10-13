import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import AstrologerPanel from "@/components/AstrologerPanel";
import { Button } from "@/components/ui/button";
import { HelpBubble } from "@/components/HelpBubble";

export default function AstrologerHub() {
  const { id } = useParams();
  const { t } = useTranslation();
  if (!id) return null;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <HelpBubble helpKey="astrologer.title">
          <h1 className="font-serif text-2xl text-[#8fb6ff]">{t("hub.title")}</h1>
        </HelpBubble>
        <Button variant="outline" size="sm" asChild><Link to={`/profile/${id}`}>{t("profile.detail.back")}</Link></Button>
      </div>
      <AstrologerPanel profileId={id} />
    </div>
  );
}
