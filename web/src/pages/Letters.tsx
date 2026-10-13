import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import LettersInbox from "@/components/LettersInbox";
import { Button } from "@/components/ui/button";
import { HelpBubble } from "@/components/HelpBubble";

export default function Letters() {
  const { id } = useParams();
  const { t } = useTranslation();
  if (!id) return null;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <HelpBubble helpKey="letters.title">
          <h1 className="font-serif text-2xl text-[#8fb6ff]">{t("letters.title", "Letters from your astrologer")}</h1>
        </HelpBubble>
        <Button variant="outline" size="sm" asChild><Link to={`/profile/${id}`}>{t("profile.detail.back", "Back")}</Link></Button>
      </div>
      <LettersInbox profileId={id} />
    </div>
  );
}
