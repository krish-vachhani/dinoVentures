import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useCurrentUser, useLogin, useRegister } from "../api/hooks";
import { InlineError } from "../components/States";

/** Login and registration share one form; `mode` decides which fields and endpoint to use. */
export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";

  const { data: user } = useCurrentUser();
  const login = useLogin();
  const register = useRegister();
  const mutation = isRegister ? register : login;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  if (user) return <Navigate to={redirectTo} replace />;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const onSuccess = () => navigate(redirectTo, { replace: true });
    if (isRegister) {
      register.mutate({ email, password, displayName }, { onSuccess });
    } else {
      login.mutate({ email, password }, { onSuccess });
    }
  }

  return (
    <div className="auth">
      <form className="card auth__card" onSubmit={handleSubmit} noValidate={false}>
        <h1>{isRegister ? "Create your account" : "Welcome back"}</h1>
        <p className="muted">
          {isRegister ? "Start with an empty vault and fill it with Gold Coins." : "Log in to your Coin Vault."}
        </p>

        {isRegister && (
          <label className="field">
            <span>Display name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              minLength={2}
              maxLength={32}
              required
              autoComplete="nickname"
            />
          </label>
        )}

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={isRegister ? 8 : undefined}
            required
            autoComplete={isRegister ? "new-password" : "current-password"}
          />
          {isRegister && <small className="muted">At least 8 characters.</small>}
        </label>

        <InlineError error={mutation.error} />

        <button type="submit" className="button button--primary button--block" disabled={mutation.isPending}>
          {mutation.isPending ? "Please wait…" : isRegister ? "Create account" : "Log in"}
        </button>

        <p className="auth__switch muted">
          {isRegister ? (
            <>
              Already have an account? <Link to="/login">Log in</Link>
            </>
          ) : (
            <>
              New here? <Link to="/register">Create an account</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
