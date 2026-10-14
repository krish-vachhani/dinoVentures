import { Link } from "react-router-dom";
import { useInventory } from "../api/hooks";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import { categoryLabels, formatDate } from "../lib/format";

export function InventoryPage() {
  const inventory = useInventory();

  return (
    <>
      <section className="page-header">
        <div>
          <h1>Inventory</h1>
          <p className="muted">Everything you own.</p>
        </div>
      </section>

      {inventory.isPending ? (
        <LoadingState label="Loading inventory…" />
      ) : inventory.isError ? (
        <ErrorState error={inventory.error} onRetry={() => void inventory.refetch()} />
      ) : inventory.data.length === 0 ? (
        <EmptyState title="Your inventory is empty">
          <Link to="/" className="button button--primary">
            Browse the store
          </Link>
        </EmptyState>
      ) : (
        <div className="grid">
          {inventory.data.map((item) => (
            <article key={item.id} className={`card product ${item.isActive ? "" : "product--expired"}`}>
              <div className="product__art">
                <img src={item.product.imageUrl} alt="" loading="lazy" />
                <span className={`tag tag--${item.product.category.toLowerCase()}`}>
                  {categoryLabels[item.product.category]}
                </span>
              </div>
              <div className="product__body">
                <h3 className="product__name">{item.product.name}</h3>
                <p className="muted">Acquired {formatDate(item.grantedAt)}</p>
                <p className="product__season">
                  {item.validUntil
                    ? `${item.isActive ? "Valid until" : "Expired"} ${formatDate(item.validUntil)}`
                    : "Permanent"}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
