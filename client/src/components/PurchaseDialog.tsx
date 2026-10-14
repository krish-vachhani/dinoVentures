import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client";
import { usePurchaseProduct } from "../api/hooks";
import type { Product } from "../api/types";
import { newIdempotencyKey } from "../lib/format";
import { Coins } from "./Coins";
import { Modal } from "./Modal";
import { InlineError } from "./States";

interface PurchaseDialogProps {
  product: Product;
  balance: number;
  onClose: () => void;
}

export function PurchaseDialog({ product, balance, onClose }: PurchaseDialogProps) {
  // One key per dialog: pressing "Confirm" again after a network error retries
  // the same purchase instead of starting a second one.
  const [idempotencyKey] = useState(newIdempotencyKey);
  const purchase = usePurchaseProduct();

  const shortfall = product.priceCoins - balance;
  const balanceAfter = purchase.data?.wallet.balance ?? balance - product.priceCoins;
  const insufficientFunds =
    shortfall > 0 || (purchase.error instanceof ApiError && purchase.error.code === "INSUFFICIENT_FUNDS");

  if (purchase.isSuccess) {
    return (
      <Modal title="Purchase complete" onClose={onClose}>
        <div className="modal__body">
          <img className="modal__art" src={product.imageUrl} alt="" />
          <p>
            <strong>{product.name}</strong> is now in your inventory.
          </p>
          <p className="muted">
            New balance: <Coins amount={purchase.data.wallet.balance} />
          </p>
        </div>
        <footer className="modal__footer">
          <Link to="/inventory" className="button button--ghost">
            View inventory
          </Link>
          <button type="button" className="button button--primary" onClick={onClose}>
            Keep shopping
          </button>
        </footer>
      </Modal>
    );
  }

  return (
    <Modal title={`Buy ${product.name}?`} onClose={onClose} busy={purchase.isPending}>
      <div className="modal__body">
        <img className="modal__art" src={product.imageUrl} alt="" />
        <dl className="summary">
          <div>
            <dt>Price</dt>
            <dd>
              <Coins amount={product.priceCoins} />
            </dd>
          </div>
          <div>
            <dt>Your balance</dt>
            <dd>
              <Coins amount={balance} />
            </dd>
          </div>
          {shortfall <= 0 && (
            <div>
              <dt>Balance after</dt>
              <dd>
                <Coins amount={balanceAfter} />
              </dd>
            </div>
          )}
        </dl>

        {shortfall > 0 && (
          <p className="notice">
            You need <Coins amount={shortfall} size="sm" /> more to buy this.
          </p>
        )}
        <InlineError error={purchase.error} />
      </div>

      <footer className="modal__footer">
        <button type="button" className="button button--ghost" onClick={onClose} disabled={purchase.isPending}>
          Cancel
        </button>
        {insufficientFunds ? (
          <Link to="/coins" className="button button--primary">
            Buy Gold Coins
          </Link>
        ) : (
          <button
            type="button"
            className="button button--primary"
            disabled={purchase.isPending}
            onClick={() => purchase.mutate({ productId: product.id, idempotencyKey })}
          >
            {purchase.isPending ? "Purchasing…" : "Confirm purchase"}
          </button>
        )}
      </footer>
    </Modal>
  );
}
