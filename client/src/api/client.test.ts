import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest, errorMessage } from "./client";

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("sends JSON with the session cookie and idempotency key", async () => {
    const fetchMock = mockFetch(201, { ok: true });

    await apiRequest("/orders", { method: "POST", body: { productId: "p1" }, idempotencyKey: "key-12345" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/orders",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ productId: "p1" }),
        headers: expect.objectContaining({ "Idempotency-Key": "key-12345", "Content-Type": "application/json" }),
      }),
    );
  });

  it("turns the API error envelope into an ApiError", async () => {
    mockFetch(409, { error: { code: "INSUFFICIENT_FUNDS", message: "Not enough Gold Coins", details: { balance: 5 } } });

    const error = await apiRequest("/orders").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "INSUFFICIENT_FUNDS", details: { balance: 5 } });
  });

  it("reports network failures with a friendly message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = await apiRequest("/wallet").catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });
});

describe("errorMessage", () => {
  it("prefers the first field message for validation errors", () => {
    const error = new ApiError(400, "VALIDATION_FAILED", "Request validation failed", [
      { field: "password", message: "Password must be at least 8 characters" },
    ]);
    expect(errorMessage(error)).toBe("Password must be at least 8 characters");
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(errorMessage(new Error("boom"))).toBe("Something went wrong. Please try again.");
  });
});
