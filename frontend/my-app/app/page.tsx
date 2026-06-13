"use client";
import { useEffect, useState } from "react";
import api from "../utils/dataProvider.js";

type Mode = "login" | "register";

const hasAuthToken = () =>
  typeof document !== "undefined" &&
  document.cookie.split("; ").some((c) => c.startsWith("authToken="));

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const clearCredentials = () => {
    setUser("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setError(null);
    setInfo(null);
    setLoading(false);
  };

  useEffect(() => {
    // If the user is already authenticated (e.g. pressed Back after logging in),
    // don't show the login form at all — send them forward again.
    if (hasAuthToken()) {
      window.location.replace("/simulation");
      return;
    }

    // When the browser restores this page from the back/forward cache (bfcache),
    // React state is restored too — including typed credentials. Wipe them.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        if (hasAuthToken()) {
          window.location.replace("/simulation");
        } else {
          clearCredentials();
        }
      }
    };

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const setAuthCookies = (token: string, role?: string) => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `authToken=${token}; path=/; max-age=3600; SameSite=Lax${secure}`;
    if (role) {
      document.cookie = `authRole=${role}; path=/; max-age=3600; SameSite=Lax${secure}`;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const data = await api.login(user, password);
        if (data?.token) {
          setAuthCookies(data.token, data.role);
          // Clear credentials from state BEFORE navigating, so the bfcache
          // snapshot of this page never contains them.
          clearCredentials();
          window.location.replace("/simulation");
        } else {
          setError("Unexpected response from server");
        }
      } else {
        const data = await api.register(user, password);
        // If the server returns a token on register, log the user in directly.
        if (data?.token) {
          setAuthCookies(data.token, data.role);
          clearCredentials();
          window.location.replace("/simulation");
        } else {
          // Otherwise, switch to login mode and let them sign in.
          setMode("login");
          setPassword("");
          setConfirmPassword("");
          setInfo("Account created — please sign in");
        }
      }
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      if (mode === "login" && e.status === 401) {
        setError("Invalid credentials");
      } else if (mode === "register" && e.status === 409) {
        setError("User already exists");
      } else {
        setError(e.message || (mode === "login" ? "Login failed" : "Registration failed"));
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next: Mode) => {
    if (loading || next === mode) return;
    setMode(next);
    setError(null);
    setInfo(null);
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-black overflow-hidden w-full">
      {/* Fondo espacial difuminado */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(255,255,255,0.05)_0%,_transparent_70%)] animate-pulse" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px]" />

      {/* Formulario Glassmorphism */}
      <div className="w-full max-w-sm p-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-10">
        <h2 className="text-2xl font-light text-white text-center mb-8 tracking-[0.2em]">
          DARK FOREST
        </h2>

        {/* Mode toggle */}
        <div className="flex mb-8 border border-white/10">
          <button
            type="button"
            onClick={() => switchMode("login")}
            disabled={loading}
            className={`flex-1 py-2 text-[10px] tracking-widest transition-all duration-300 disabled:opacity-50 ${
              mode === "login"
                ? "bg-white text-black"
                : "text-gray-400 hover:text-white"
            }`}
          >
            SIGN IN
          </button>
          <button
            type="button"
            onClick={() => switchMode("register")}
            disabled={loading}
            className={`flex-1 py-2 text-[10px] tracking-widest transition-all duration-300 disabled:opacity-50 ${
              mode === "register"
                ? "bg-white text-black"
                : "text-gray-400 hover:text-white"
            }`}
          >
            REGISTER
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[10px] text-gray-400 tracking-widest mb-2">USER</label>
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              disabled={loading}
              autoComplete="username"
              className="w-full bg-white/5 border border-white/10 p-3 text-white focus:outline-none focus:border-white transition-all disabled:opacity-50"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-400 tracking-widest mb-2">PASSWORD</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                minLength={mode === "register" ? 8 : undefined}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                className="w-full bg-white/5 border border-white/10 p-3 pr-16 text-white focus:outline-none focus:border-white transition-all disabled:opacity-50"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                disabled={loading}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 px-3 text-[10px] tracking-widest text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                {showPassword ? "HIDE" : "VIEW"}
              </button>
            </div>
          </div>

          {mode === "register" && (
            <div>
              <label className="block text-[10px] text-gray-400 tracking-widest mb-2">
                CONFIRM PASSWORD
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full bg-white/5 border border-white/10 p-3 pr-16 text-white focus:outline-none focus:border-white transition-all disabled:opacity-50"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={loading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 px-3 text-[10px] tracking-widest text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  {showPassword ? "HIDE" : "VIEW"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-[10px] tracking-widest text-red-400 text-center">
              {error.toUpperCase()}
            </p>
          )}

          {info && !error && (
            <p className="text-[10px] tracking-widest text-green-400 text-center">
              {info.toUpperCase()}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 border border-white text-white text-[10px] tracking-widest hover:bg-white hover:text-black transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "..." : mode === "login" ? "ENTER" : "CREATE ACCOUNT"}
          </button>
        </form>
      </div>
    </main>
  );
}