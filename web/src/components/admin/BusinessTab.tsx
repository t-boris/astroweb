import { useEffect, useState } from "react";
import { adminStats, type BusinessStats, type StatsGrouping, type StatsPeriod } from "@/api/admin";
import { Button } from "@/components/ui/button";

const PERIODS: StatsPeriod[] = ["7d", "30d", "90d", "all"];
const GROUPINGS: StatsGrouping[] = ["day", "week", "month"];

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="ds-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-serif text-primary" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</p>
    </div>
  );
}

export default function BusinessTab() {
  const [period, setPeriod] = useState<StatsPeriod>("30d");
  const [grouping, setGrouping] = useState<StatsGrouping>("day");
  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setStats(await adminStats(period, grouping));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, grouping]);

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition-colors ${
      active ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="space-y-6" data-testid="business-tab">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p} type="button" className={chip(p === period)} onClick={() => setPeriod(p)}>
              {p === "all" ? "All time" : p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Group by">
          {GROUPINGS.map((g) => (
            <button key={g} type="button" className={chip(g === grouping)} onClick={() => setGrouping(g)}>
              {g}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? "…" : "Refresh"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!stats && loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {stats && (
        <>
          <p className="text-xs text-muted-foreground">
            {stats.since ? `Since ${stats.since.slice(0, 10)} (UTC)` : "All time"} · live-mode purchases only · day, week
            and month buckets are UTC (weeks start Monday) · revenue is per currency, subscription charges are not
            included
            {stats.testPurchasesExcluded > 0 ? ` · ${stats.testPurchasesExcluded} test-mode purchase(s) excluded` : ""}
          </p>

          {stats.currencies.length === 0 && (
            <p className="text-sm text-muted-foreground">No live purchases in this period.</p>
          )}

          {stats.currencies.map((c) => {
            const max = Math.max(1, ...c.series.map((b) => b.revenueCents));
            return (
              <section key={c.currency} className="space-y-3" data-testid={`currency-${c.currency}`}>
                <h2 className="font-serif text-lg text-primary">{c.currency}</h2>
                <div className="grid gap-4 sm:grid-cols-4">
                  <Kpi label="Revenue" value={money(c.revenueCents, c.currency)} />
                  <Kpi label="Purchases" value={c.purchases} />
                  <Kpi label="Paying users" value={c.payingUsers} />
                  <Kpi label="ARPPU" value={money(c.arppuCents, c.currency)} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="py-2 pr-3">{grouping === "week" ? "Week of" : grouping === "month" ? "Month" : "Day"}</th>
                        <th className="py-2 pr-3">Purchases</th>
                        <th className="py-2 pr-3">Revenue</th>
                        <th className="w-1/2 py-2 pr-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {c.series.map((b) => (
                        <tr key={b.bucket} className="border-b border-border/50">
                          <td className="py-1.5 pr-3 text-muted-foreground">{b.bucket}</td>
                          <td className="py-1.5 pr-3">{b.purchases}</td>
                          <td className="py-1.5 pr-3">{money(b.revenueCents, c.currency)}</td>
                          <td className="py-1.5 pr-3">
                            <div className="h-2 rounded-full bg-primary/70" style={{ width: `${(b.revenueCents / max) * 100}%` }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi label="Active subscriptions" value={stats.subscriptions.active} />
            <Kpi label="Past due" value={stats.subscriptions.past_due} />
            <Kpi label="Canceled" value={stats.subscriptions.canceled} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi label="New profiles" value={stats.newProfiles} />
            <Kpi label="Paying users (all currencies)" value={stats.totals.payingUsers} />
            <Kpi label="Purchases (all currencies)" value={stats.totals.purchases} />
          </div>

          <section className="space-y-2">
            <h2 className="font-serif text-lg text-primary">Stars spent per feature</h2>
            <p className="text-xs text-muted-foreground">
              Net of refunds. {stats.starLedgerSince
                ? `Recorded since ${stats.starLedgerSince.slice(0, 10)}; earlier spending is not available.`
                : "Spending is recorded from the moment this release went live; nothing has been spent since."}
            </p>
            {stats.starsByFeature.length === 0 ? (
              <p className="text-sm text-muted-foreground">No star spending in this period.</p>
            ) : (
              <table className="w-full text-sm" data-testid="stars-table">
                <tbody>
                  {stats.starsByFeature.map((f) => (
                    <tr key={f.feature} className="border-b border-border/50">
                      <td className="py-1.5 pr-3 text-foreground">{f.feature}</td>
                      <td className="py-1.5 pr-3 text-[#e8c969]">✦{f.stars}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
