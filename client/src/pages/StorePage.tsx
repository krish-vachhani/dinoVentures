import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCurrentUser, useProducts } from "../api/hooks";
import type { Product, ProductCategory } from "../api/types";
import { ProductCard } from "../components/ProductCard";
import { PurchaseDialog } from "../components/PurchaseDialog";
import { EmptyState, ErrorState, LoadingState } from "../components/States";

const filters: { value: ProductCategory | undefined; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "SKIN", label: "Skins" },
  { value: "EMOTE", label: "Emotes" },
  { value: "BATTLE_PASS", label: "Battle Passes" },
];

function parseCategory(value: string | null): ProductCategory | undefined {
  return value === "SKIN" || value === "EMOTE" || value === "BATTLE_PASS" ? value : undefined;
}

export function StorePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = parseCategory(searchParams.get("category")); // in the URL, so filters are shareable
  const products = useProducts(category);
  const { data: user } = useCurrentUser();
  const [selected, setSelected] = useState<Product | null>(null);

  const balance = user?.balance ?? 0;

  return (
    <>
      <section className="page-header">
        <div>
          <h1>Store</h1>
          <p className="muted">Skins, emotes and battle passes, paid for in Gold Coins.</p>
        </div>
        <div className="segmented" role="tablist" aria-label="Filter by category">
          {filters.map((filter) => (
            <button
              key={filter.label}
              type="button"
              role="tab"
              aria-selected={category === filter.value}
              className="segmented__item"
              onClick={() => setSearchParams(filter.value ? { category: filter.value } : {})}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      {products.isPending ? (
        <LoadingState label="Loading products…" />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : products.data.length === 0 ? (
        <EmptyState title="Nothing here yet" />
      ) : (
        <div className="grid">
          {products.data.map((product) => (
            <ProductCard key={product.id} product={product} balance={balance} onBuy={setSelected} />
          ))}
        </div>
      )}

      {selected && <PurchaseDialog product={selected} balance={balance} onClose={() => setSelected(null)} />}
    </>
  );
}
