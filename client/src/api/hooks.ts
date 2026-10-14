import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ApiError, apiRequest } from "./client";
import type {
  CoinPackage,
  InventoryItem,
  Order,
  Page,
  Product,
  ProductCategory,
  Topup,
  User,
  WalletTransaction,
} from "./types";

/** Central list of cache keys, so invalidation stays in one place. */
export const queryKeys = {
  me: ["me"] as const,
  config: ["config"] as const,
  products: (category?: ProductCategory) => ["products", category ?? "ALL"] as const,
  coinPackages: ["coin-packages"] as const,
  inventory: ["inventory"] as const,
  transactions: ["wallet", "transactions"] as const,
  orders: ["orders"] as const,
  topups: ["topups"] as const,
  topupStatus: (topupId?: string) => ["topup-status", topupId] as const,
};

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** The signed-in user, or null when there is no valid session. */
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        const { user } = await apiRequest<{ user: User }>("/auth/me");
        return user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 30_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      apiRequest<{ user: User }>("/auth/login", { method: "POST", body: input }),
    onSuccess: ({ user }) => {
      queryClient.clear(); // drop anything cached for a previous session
      queryClient.setQueryData(queryKeys.me, user);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string; displayName: string }) =>
      apiRequest<{ user: User }>("/auth/register", { method: "POST", body: input }),
    onSuccess: ({ user }) => {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<void>("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me, null);
    },
  });
}

export function useAppConfig() {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: () => apiRequest<{ paymentSimulationEnabled: boolean }>("/config"),
    staleTime: Infinity,
  });
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export function useProducts(category?: ProductCategory) {
  return useQuery({
    queryKey: queryKeys.products(category),
    queryFn: async () => {
      const query = category ? `?category=${category}` : "";
      return (await apiRequest<{ items: Product[] }>(`/products${query}`)).items;
    },
  });
}

export function useCoinPackages() {
  return useQuery({
    queryKey: queryKeys.coinPackages,
    queryFn: async () => (await apiRequest<{ items: CoinPackage[] }>("/coin-packages")).items,
  });
}

// ---------------------------------------------------------------------------
// Money-moving mutations
// ---------------------------------------------------------------------------

/** Refreshes everything a balance change can affect. */
function useInvalidateAccount() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.me }),
      queryClient.invalidateQueries({ queryKey: ["products"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory }),
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions }),
      queryClient.invalidateQueries({ queryKey: queryKeys.orders }),
      queryClient.invalidateQueries({ queryKey: queryKeys.topups }),
    ]);
}

export function usePurchaseProduct() {
  const invalidateAccount = useInvalidateAccount();
  return useMutation({
    mutationFn: (input: { productId: string; idempotencyKey: string }) =>
      apiRequest<{ order: Order; wallet: { balance: number } }>("/orders", {
        method: "POST",
        body: { productId: input.productId },
        idempotencyKey: input.idempotencyKey,
      }),
    onSettled: invalidateAccount,
  });
}

export function useStartTopup() {
  return useMutation({
    mutationFn: (input: { packageId: string; idempotencyKey: string }) =>
      apiRequest<{ topup: Topup }>("/topups", {
        method: "POST",
        body: { packageId: input.packageId },
        idempotencyKey: input.idempotencyKey,
      }),
  });
}

/**
 * Watches a top-up until the payment provider settles it. Used when payment
 * simulation is off: coins then arrive asynchronously through the webhook.
 */
export function useTopupStatus(topupId: string | undefined, enabled: boolean) {
  const invalidateAccount = useInvalidateAccount();
  const query = useQuery({
    // Deliberately outside the ["topups"] prefix, so refreshing the account
    // after settlement does not invalidate (and restart) this poll.
    queryKey: queryKeys.topupStatus(topupId),
    enabled: enabled && topupId !== undefined,
    queryFn: async () => (await apiRequest<{ topup: Topup }>(`/topups/${topupId}`)).topup,
    refetchInterval: (current) => (current.state.data?.paymentStatus === "PENDING" ? 2_000 : false),
    refetchOnWindowFocus: false,
  });

  const settled = query.data !== undefined && query.data.paymentStatus !== "PENDING";
  useEffect(() => {
    if (settled) void invalidateAccount(); // refresh balance, ledger and payment history once
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per settlement, not per render
  }, [settled]);

  return query;
}

/** Asks the mock provider to settle a payment (when MOCK_PAYMENT_SIMULATION is on). */
export function useSimulatePayment() {
  const invalidateAccount = useInvalidateAccount();
  return useMutation({
    mutationFn: (input: { topupId: string; outcome: "success" | "failure" }) =>
      apiRequest<{ topup: Topup; wallet: { balance: number } }>(`/topups/${input.topupId}/simulate-payment`, {
        method: "POST",
        body: { outcome: input.outcome },
      }),
    onSettled: invalidateAccount,
  });
}

// ---------------------------------------------------------------------------
// Account data
// ---------------------------------------------------------------------------

export function useInventory() {
  return useQuery({
    queryKey: queryKeys.inventory,
    queryFn: async () => (await apiRequest<{ items: InventoryItem[] }>("/inventory")).items,
  });
}

function usePaginated<T>(queryKey: readonly unknown[], path: string, pageSize = 20) {
  return useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (pageParam) params.set("cursor", pageParam);
      return apiRequest<Page<T>>(`${path}?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export const useWalletTransactions = () => usePaginated<WalletTransaction>(queryKeys.transactions, "/wallet/transactions");
export const useOrders = () => usePaginated<Order>(queryKeys.orders, "/orders");
export const useTopups = () => usePaginated<Topup>(queryKeys.topups, "/topups");
