import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useCurrentUser, useLogout } from "../api/hooks";
import { Coins } from "./Coins";

const navItems = [
  { to: "/", label: "Store", end: true },
  { to: "/coins", label: "Buy Coins" },
  { to: "/inventory", label: "Inventory" },
  { to: "/history", label: "History" },
];

export function Layout() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="brand">
            <span className="brand__mark" aria-hidden="true" />
            Coin Vault
          </Link>

          <nav className="nav" aria-label="Main">
            {user &&
              navItems.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className="nav__link">
                  {item.label}
                </NavLink>
              ))}
          </nav>

          {user && (
            <div className="account">
              <Link to="/coins" className="balance" title="Your Gold Coin balance. Click to buy more.">
                <Coins amount={user.balance} />
              </Link>
              <span className="account__name">{user.displayName}</span>
              <button
                type="button"
                className="button button--ghost button--sm"
                disabled={logout.isPending}
                onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/login") })}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
