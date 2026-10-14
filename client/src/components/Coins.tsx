import { formatCoins } from "../lib/format";

/** A Gold Coin amount with the coin icon. */
export function Coins({ amount, size = "md" }: { amount: number; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`coins coins--${size}`}>
      <span className="coins__icon" aria-hidden="true" />
      <span>{formatCoins(amount)}</span>
      <span className="visually-hidden"> Gold Coins</span>
    </span>
  );
}
