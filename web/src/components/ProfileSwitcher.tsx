import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronDown, Check, Plus } from "lucide-react";
import type { Profile } from "@/types";

/**
 * Header profile switcher — lets the user jump between profiles while viewing
 * OR editing, without going back Home. Context-aware: switching while on an
 * edit page keeps you in edit mode for the chosen profile.
 */
export default function ProfileSwitcher({ profiles }: { profiles: Profile[] }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (profiles.length === 0) return null;

  const match = location.pathname.match(/^\/profile\/([^/]+)(\/edit)?$/);
  const currentId = match && match[1] !== "new" ? match[1] : null;
  const editing = Boolean(match?.[2]);
  const current = profiles.find((p) => p.id === currentId) ?? null;

  function go(id: string) {
    setOpen(false);
    navigate(editing ? `/profile/${id}/edit` : `/profile/${id}`);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[40vw] items-center gap-1.5 rounded-full border border-primary/30 bg-background/60 px-3 py-1.5 text-sm text-foreground transition-colors hover:border-primary/60"
      >
        <span className="truncate font-serif text-[#8fb6ff]">
          {current ? current.name : t("nav.profiles", "Profiles")}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 flex-none text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 max-h-[70vh] w-60 overflow-y-auto rounded-md border border-primary/20 bg-background/95 p-1.5 shadow-xl backdrop-blur-md">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => go(p.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-primary/10 ${
                  p.id === currentId ? "text-[#8fb6ff]" : "text-foreground"
                }`}
              >
                <Check className={`h-3.5 w-3.5 flex-none ${p.id === currentId ? "opacity-100 text-[#8fb6ff]" : "opacity-0"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif">{p.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{p.birthDate}</span>
                </span>
              </button>
            ))}
            <Link
              to="/profile/new"
              onClick={() => setOpen(false)}
              className="mt-1 flex items-center gap-2 rounded-md border-t border-primary/10 px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5 flex-none" />
              {t("home.createProfile", "New profile")}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
