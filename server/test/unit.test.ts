import { describe, expect, it } from "vitest";
import { toPage } from "../src/lib/http.js";
import { buildPaymentEvent, isValidSignature, signPayload } from "../src/modules/payments/mockPaymentProvider.js";

describe("mock payment provider signatures", () => {
  const body = Buffer.from(JSON.stringify({ id: "evt_1", amount: 100 }));

  it("accepts its own signature", () => {
    expect(isValidSignature(body, signPayload(body))).toBe(true);
  });

  it("rejects a signature for a different body", () => {
    const tampered = Buffer.from(JSON.stringify({ id: "evt_1", amount: 999_999 }));
    expect(isValidSignature(tampered, signPayload(body))).toBe(false);
  });

  it("rejects missing and malformed signatures", () => {
    expect(isValidSignature(body, undefined)).toBe(false);
    expect(isValidSignature(body, "")).toBe(false);
    expect(isValidSignature(body, "sha256=abc")).toBe(false);
  });

  it("builds events with unique ids and a failure reason only on failure", () => {
    const success = buildPaymentEvent({ paymentRef: "ref", amountMinor: 100, currency: "INR", outcome: "success" });
    const failure = buildPaymentEvent({ paymentRef: "ref", amountMinor: 100, currency: "INR", outcome: "failure" });

    expect(success.id).not.toBe(failure.id);
    expect(success.type).toBe("payment.succeeded");
    expect(success.data.failureReason).toBeUndefined();
    expect(failure.type).toBe("payment.failed");
    expect(failure.data.failureReason).toEqual(expect.any(String));
  });
});

describe("toPage", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns a cursor when an extra row was fetched", () => {
    expect(toPage(rows, { limit: 2 }, (row) => row.id)).toEqual({ items: ["a", "b"], nextCursor: "b" });
  });

  it("returns no cursor on the last page", () => {
    expect(toPage(rows, { limit: 3 }, (row) => row.id)).toEqual({ items: ["a", "b", "c"], nextCursor: null });
  });
});
