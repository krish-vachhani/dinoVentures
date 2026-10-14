import { useSearchParams } from "react-router-dom";
import { useOrders, useTopups, useWalletTransactions } from "../api/hooks";
import type { PaymentStatus } from "../api/types";
import { Coins } from "../components/Coins";
import { LoadMore } from "../components/LoadMore";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import { categoryLabels, formatDateTime, formatMoney, formatSignedCoins } from "../lib/format";

const tabs = [
  { id: "coins", label: "Coin transactions" },
  { id: "purchases", label: "Purchases" },
  { id: "payments", label: "Payments" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const active: TabId = tabs.find((tab) => tab.id === searchParams.get("tab"))?.id ?? "coins";

  return (
    <>
      <section className="page-header">
        <div>
          <h1>History</h1>
          <p className="muted">Every coin in and out of your wallet, every purchase and every payment attempt.</p>
        </div>
        <div className="segmented" role="tablist" aria-label="History type">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active === tab.id}
              className="segmented__item"
              onClick={() => setSearchParams({ tab: tab.id })}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {active === "coins" && <CoinTransactions />}
      {active === "purchases" && <Purchases />}
      {active === "payments" && <Payments />}
    </>
  );
}

function CoinTransactions() {
  const query = useWalletTransactions();
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const rows = query.data.pages.flatMap((page) => page.items);
  if (rows.length === 0) return <EmptyState title="No coin transactions yet" />;

  return (
    <div className="card table-card">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Type</th>
            <th className="num">Amount</th>
            <th className="num">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDateTime(row.createdAt)}</td>
              <td>{row.description}</td>
              <td>
                <span className={`pill ${row.amount > 0 ? "pill--credit" : "pill--debit"}`}>
                  {row.type === "TOPUP_CREDIT" ? "Top-up" : "Purchase"}
                </span>
              </td>
              <td className={`num ${row.amount > 0 ? "credit" : "debit"}`}>{formatSignedCoins(row.amount)}</td>
              <td className="num">
                <Coins amount={row.balanceAfter} size="sm" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <LoadMore
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        onLoadMore={() => void query.fetchNextPage()}
      />
    </div>
  );
}

function Purchases() {
  const query = useOrders();
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const rows = query.data.pages.flatMap((page) => page.items);
  if (rows.length === 0) return <EmptyState title="No purchases yet" />;

  return (
    <div className="card table-card">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Product</th>
            <th>Category</th>
            <th className="num">Qty</th>
            <th className="num">Price paid</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{formatDateTime(row.createdAt)}</td>
              <td>{row.productName}</td>
              <td>{categoryLabels[row.productCategory]}</td>
              <td className="num">{row.quantity}</td>
              <td className="num">
                <Coins amount={row.totalCoins} size="sm" />
              </td>
              <td>
                <span className="pill pill--credit">Completed</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <LoadMore
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        onLoadMore={() => void query.fetchNextPage()}
      />
    </div>
  );
}

const paymentStatusLabels: Record<PaymentStatus, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "pill--pending" },
  SUCCEEDED: { label: "Succeeded", className: "pill--credit" },
  FAILED: { label: "Failed", className: "pill--debit" },
};

function Payments() {
  const query = useTopups();
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const rows = query.data.pages.flatMap((page) => page.items);
  if (rows.length === 0) return <EmptyState title="No payments yet" />;

  return (
    <div className="card table-card">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Package</th>
            <th className="num">Coins</th>
            <th className="num">Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = paymentStatusLabels[row.paymentStatus];
            return (
              <tr key={row.id}>
                <td>{formatDateTime(row.createdAt)}</td>
                <td>{row.packageName}</td>
                <td className="num">
                  <Coins amount={row.coinsTotal} size="sm" />
                </td>
                <td className="num">{formatMoney(row.priceMinor, row.currency)}</td>
                <td>
                  <span className={`pill ${status.className}`} title={row.failureReason ?? undefined}>
                    {status.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <LoadMore
        hasNextPage={query.hasNextPage}
        isFetchingNextPage={query.isFetchingNextPage}
        onLoadMore={() => void query.fetchNextPage()}
      />
    </div>
  );
}
