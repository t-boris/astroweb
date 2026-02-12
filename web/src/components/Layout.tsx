import { Link, Outlet, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function Layout() {
  const { t } = useTranslation();
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-xl font-bold tracking-tight text-gold-gradient">
            {t("app.title")}
          </Link>
          <LanguageSwitcher />
        </div>
      </header>
      <main className={isHome ? "" : "mx-auto max-w-4xl px-4 py-8"}>
        <Outlet />
      </main>
    </div>
  );
}
