import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Product } from "../api/types";
import { PurchaseDialog } from "./PurchaseDialog";

const product: Product = {
  id: "11111111-1111-4111-8111-111111111111",
  sku: "skin-neon-ronin",
  name: "Neon Ronin",
  description: "Glows in the dark.",
  category: "SKIN",
  imageUrl: "/images/products/skin-neon-ronin.svg",
  priceCoins: 800,
  season: null,
};

function renderDialog(balance: number) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PurchaseDialog product={product} balance={balance} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PurchaseDialog", () => {
  it("shows the shortfall and links to buying coins when the balance is too low", () => {
    renderDialog(300);

    expect(screen.getByText(/more to buy this/)).toHaveTextContent("500");
    expect(screen.getByRole("link", { name: "Buy Gold Coins" })).toHaveAttribute("href", "/coins");
    expect(screen.queryByRole("button", { name: "Confirm purchase" })).not.toBeInTheDocument();
  });

  it("reuses the same idempotency key when the user retries after a failure", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        jsonResponse(201, {
          order: { id: "o1", productName: "Neon Ronin" },
          wallet: { balance: 200 },
        }),
      )
      .mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderDialog(1_000);
    await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);

    await user.click(screen.getByRole("button", { name: "Confirm purchase" }));
    expect(await screen.findByText("Purchase complete")).toBeInTheDocument();

    const keys = fetchMock.mock.calls
      .filter(([url]) => url === "/api/orders")
      .map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers["Idempotency-Key"]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });
});
