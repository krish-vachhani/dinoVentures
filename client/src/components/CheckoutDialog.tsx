import { useEffect, useState } from "react";
import { useAppConfig, useSimulatePayment, useStartTopup, useTopupStatus } from "../api/hooks";
import type { CoinPackage } from "../api/types";
import { formatMoney, newIdempotencyKey } from "../lib/format";
import { Coins } from "./Coins";
import { Modal } from "./Modal";
import { InlineError, LoadingState } from "./States";

interface CheckoutDialogProps {
  coinPackage: CoinPackage;
  onClose: () => void;
}

/**
 * Mock checkout. With a real gateway this would redirect to the provider's
 * hosted page, and coins would arrive through the provider's webhook. While
 * MOCK_PAYMENT_SIMULATION is on, the server lets the user pick the outcome.
 * Otherwise the dialog waits for the webhook by polling the top-up.
 */
export function CheckoutDialog({ coinPackage, onClose }: CheckoutDialogProps) {
  const [idempotencyKey] = useState(newIdempotencyKey);
  const startTopup = useStartTopup();
  const simulatePayment = useSimulatePayment();
  const { data: appConfig } = useAppConfig();

  const { mutate: start } = startTopup;
  useEffect(() => {
    // The idempotency key makes this safe even if React runs the effect twice.
    start({ packageId: coinPackage.id, idempotencyKey });
  }, [start, coinPackage.id, idempotencyKey]);

  const simulationEnabled = appConfig?.paymentSimulationEnabled ?? false;
  const startedTopup = startTopup.data?.topup;
  const polledTopup = useTopupStatus(startedTopup?.id, appConfig !== undefined && !simulationEnabled);

  const topup = simulatePayment.data?.topup ?? polledTopup.data ?? startedTopup;
  const price = formatMoney(coinPackage.priceMinor, coinPackage.currency);
  const busy = startTopup.isPending || simulatePayment.isPending;

  if (topup?.paymentStatus === "SUCCEEDED") {
    return (
      <Modal title="Payment successful" onClose={onClose}>
        <div className="modal__body modal__body--center">
          <p className="big-coins">
            <Coins amount={topup.coinsTotal} size="lg" />
          </p>
          <p>were added to your wallet.</p>
          {simulatePayment.data && (
            <p className="muted">
              New balance: <Coins amount={simulatePayment.data.wallet.balance} size="sm" />
            </p>
          )}
        </div>
        <footer className="modal__footer">
          <button type="button" className="button button--primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </Modal>
    );
  }

  if (topup?.paymentStatus === "FAILED") {
    return (
      <Modal title="Payment failed" onClose={onClose}>
        <div className="modal__body">
          <p>{topup.failureReason ?? "The payment did not go through."}</p>
          <p className="muted">No coins were added and you were not charged.</p>
        </div>
        <footer className="modal__footer">
          <button type="button" className="button button--primary" onClick={onClose}>
            Close
          </button>
        </footer>
      </Modal>
    );
  }

  return (
    <Modal title={`Checkout: ${coinPackage.name}`} onClose={onClose} busy={busy}>
      <div className="modal__body">
        <dl className="summary">
          <div>
            <dt>You get</dt>
            <dd>
              <Coins amount={coinPackage.totalCoins} />
            </dd>
          </div>
          <div>
            <dt>You pay</dt>
            <dd>{price}</dd>
          </div>
        </dl>

        {startTopup.isPending && <LoadingState label="Creating payment…" />}
        <InlineError error={startTopup.error ?? simulatePayment.error} />

        {topup && (
          <div className="mock-gateway">
            <p className="mock-gateway__label">MockPay test gateway</p>
            <p className="muted mono">Ref: {topup.paymentRef}</p>
            {simulationEnabled ? (
              <p className="muted">Test gateway: choose how this payment should end.</p>
            ) : (
              <p className="muted">Waiting for the payment provider to confirm…</p>
            )}
          </div>
        )}
      </div>

      <footer className="modal__footer">
        <button type="button" className="button button--ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        {topup && simulationEnabled && (
          <>
            <button
              type="button"
              className="button button--danger"
              disabled={busy}
              onClick={() => simulatePayment.mutate({ topupId: topup.id, outcome: "failure" })}
            >
              Simulate failure
            </button>
            <button
              type="button"
              className="button button--primary"
              disabled={busy}
              onClick={() => simulatePayment.mutate({ topupId: topup.id, outcome: "success" })}
            >
              {simulatePayment.isPending ? "Processing…" : `Pay ${price}`}
            </button>
          </>
        )}
      </footer>
    </Modal>
  );
}
