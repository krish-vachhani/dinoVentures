import { Link, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/RequireAuth";
import { EmptyState } from "./components/States";
import { AuthPage } from "./pages/AuthPage";
import { CoinsPage } from "./pages/CoinsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { InventoryPage } from "./pages/InventoryPage";
import { StorePage } from "./pages/StorePage";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/" element={<RequireAuth><StorePage /></RequireAuth>} />
        <Route path="/coins" element={<RequireAuth><CoinsPage /></RequireAuth>} />
        <Route path="/inventory" element={<RequireAuth><InventoryPage /></RequireAuth>} />
        <Route path="/history" element={<RequireAuth><HistoryPage /></RequireAuth>} />
        <Route
          path="*"
          element={
            <EmptyState title="Page not found">
              <Link to="/">Back to the store</Link>
            </EmptyState>
          }
        />
      </Route>
    </Routes>
  );
}
