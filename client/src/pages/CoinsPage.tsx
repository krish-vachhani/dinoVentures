import { useState } from "react";
import { useCoinPackages, useCurrentUser } from "../api/hooks";
import type { CoinPackage } from "../api/types";
import { CheckoutDialog } from "../components/CheckoutDialog";
import { Coins } from "../components/Coins";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import { formatMoney } from "../lib/format";

export function CoinsPage() {
  const packages = useCoinPackages();
  const { data: user } = useCurrentUser();
  const [selected, setSelected] = useState<CoinPackage | null>(null);

  return (
    <>
      <section className="page-header">
        <div>
          <h1>Buy Gold Coins</h1>
          <p className="muted">
            Current balance: <Coins amount={user?.balance ?? 0} size="sm" />
          </p>
        </div>
      </section>

      {packages.isPending ? (
        <LoadingState label="Loading packages…" />
      ) : packages.isError ? (
        <ErrorState error={packages.error} onRetry={() => void packages.refetch()} />
      ) : packages.data.length === 0 ? (
        <EmptyState title="No coin packages are available right now" />
      ) : (
        <div className="grid grid--packages">
          {packages.data.map((pkg) => (
            <article key={pkg.id} className="card package">
              <h2 className="package__name">{pkg.name}</h2>
              <p className="package__coins">
                <Coins amount={pkg.totalCoins} size="lg" />
              </p>
              <p className="package__bonus">
                {pkg.bonusCoins > 0 ? `${pkg.baseCoins} + ${pkg.bonusCoins} bonus` : " "}
              </p>
              <button type="button" className="button button--primary button--block" onClick={() => setSelected(pkg)}>
                {formatMoney(pkg.priceMinor, pkg.currency)}
              </button>
            </article>
          ))}
        </div>
      )}

      {selected && <CheckoutDialog coinPackage={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
