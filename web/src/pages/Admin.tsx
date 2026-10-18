import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  adminListProfiles,
  adminListPurchases,
  adminListUsers,
  adminGrantToWallet,
  type AdminProfile,
  type AdminPurchase,
  type AdminUser,
} from "@/api/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BusinessTab from "@/components/admin/BusinessTab";
import AiTab from "@/components/admin/AiTab";
import { ADMIN_EMAIL } from "@/lib/admin";


export default function Admin() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [purchases, setPurchases] = useState<AdminPurchase[]>([]);
  const [revenueCents, setRevenueCents] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grantAmounts, setGrantAmounts] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"overview" | "business" | "ai">("overview");

  useEffect(() => onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); }), []);

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    if (!isAdmin) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [profs, usrs, pur] = await Promise.all([
        adminListProfiles(),
        adminListUsers(),
        adminListPurchases(),
      ]);
      setProfiles(profs);
      setUsers(usrs);
      setPurchases(pur.purchases);
      setRevenueCents(pur.revenueCents);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn() {
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleGrant(walletKey: string) {
    const amt = parseInt(grantAmounts[walletKey] ?? "", 10);
    if (!Number.isFinite(amt) || amt === 0) return;
    try {
      const newBal = await adminGrantToWallet(walletKey, amt);
      setUsers((prev) => prev.map((u) => (u.key === walletKey ? { ...u, tokens: newBal } : u)));
      setGrantAmounts((prev) => ({ ...prev, [walletKey]: "" }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!authReady) {
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-8 text-center">
        <h1 className="font-serif text-2xl text-gold-gradient">Admin</h1>
        <Button onClick={handleSignIn} className="bg-primary/20 border border-primary text-primary hover:bg-primary/30">
          Sign in with Google
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md space-y-4 p-8 text-center">
        <p className="text-destructive">Access denied for {user.email}</p>
        <Button variant="outline" onClick={() => signOut(auth)}>Sign out</Button>
      </div>
    );
  }

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl text-gold-gradient">Admin</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{user.email}</span>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? "…" : "Refresh"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => signOut(auth)}>Sign out</Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-1 border-b border-border/40" role="tablist">
        {([["overview", "Overview"], ["business", "Business"], ["ai", "AI"]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm transition-colors ${
              tab === k ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "business" && <BusinessTab />}

      {tab === "ai" && <AiTab profiles={profiles} />}

      {tab === "overview" && (<>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="ds-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Revenue</p>
          <p className="text-2xl font-serif text-primary">{fmt(revenueCents)}</p>
        </div>
        <div className="ds-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Purchases</p>
          <p className="text-2xl font-serif text-primary">{purchases.length}</p>
        </div>
        <div className="ds-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Users</p>
          <p className="text-2xl font-serif text-primary">{users.length}</p>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="font-serif text-lg text-primary">Users (star wallets)</h2>
        <p className="text-xs text-muted-foreground">
          Stars are per-user, shared across all of a user's profiles. Grant adds (or, with a
          negative number, deducts) stars from the user's wallet.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">Profiles</th>
                <th className="py-2 pr-3">✦</th>
                <th className="py-2 pr-3">Grant</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.key} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-foreground">
                    {u.isAccount ? (
                      <span>{u.email ?? u.key}</span>
                    ) : (
                      <span className="text-muted-foreground">Anonymous · {u.key.replace("device:", "").slice(0, 10)}…</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {u.profiles.map((p) => p.name).join(", ") || "—"}
                  </td>
                  <td className="py-2 pr-3 text-[#e8c969]">✦{u.tokens}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-8 w-20"
                        type="number"
                        placeholder="±"
                        value={grantAmounts[u.key] ?? ""}
                        onChange={(e) => setGrantAmounts((prev) => ({ ...prev, [u.key]: e.target.value }))}
                      />
                      <Button size="sm" variant="outline" onClick={() => void handleGrant(u.key)}>
                        Grant
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-serif text-lg text-primary">Profiles ({profiles.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Birth</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-foreground">{p.name}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{p.birthDate} · {p.birthPlace}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-serif text-lg text-primary">Purchases</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Tier</th>
                <th className="py-2 pr-3">✦</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Email</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 text-muted-foreground">{p.createdAt?.slice(0, 16).replace("T", " ")}</td>
                  <td className="py-2 pr-3">{p.tier}</td>
                  <td className="py-2 pr-3 text-[#e8c969]">✦{p.tokens}</td>
                  <td className="py-2 pr-3">{fmt(p.amountTotal)}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{p.customerEmail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </>)}
    </div>
  );
}
