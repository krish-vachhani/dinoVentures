import type { Product } from "../api/types";
import { categoryLabels, formatDate } from "../lib/format";
import { Coins } from "./Coins";

interface ProductCardProps {
  product: Product;
  balance: number;
  onBuy: (product: Product) => void;
}

export function ProductCard({ product, balance, onBuy }: ProductCardProps) {
  const canAfford = balance >= product.priceCoins;

  return (
    <article className={`card product ${product.owned ? "product--owned" : ""}`}>
      <div className="product__art">
        <img src={product.imageUrl} alt="" loading="lazy" />
        <span className={`tag tag--${product.category.toLowerCase()}`}>{categoryLabels[product.category]}</span>
      </div>

      <div className="product__body">
        <h3 className="product__name">{product.name}</h3>
        <p className="product__description">{product.description}</p>
        {product.season?.endsAt && (
          <p className="product__season">
            Season {product.season.code} · until {formatDate(product.season.endsAt)}
          </p>
        )}
      </div>

      <footer className="product__footer">
        <Coins amount={product.priceCoins} />
        {product.owned ? (
          <span className="owned-badge">Owned</span>
        ) : (
          <button
            type="button"
            className="button button--primary button--sm"
            onClick={() => onBuy(product)}
            title={canAfford ? undefined : "You need more Gold Coins"}
          >
            {canAfford ? "Buy" : "Get coins"}
          </button>
        )}
      </footer>
    </article>
  );
}
