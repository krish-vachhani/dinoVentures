import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useCurrentUser } from "../api/hooks";
import { ErrorState, LoadingState } from "./States";

/** Renders children for signed-in users, otherwise redirects to login and comes back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isPending, error, refetch } = useCurrentUser();
  const location = useLocation();

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <>{children}</>;
}
