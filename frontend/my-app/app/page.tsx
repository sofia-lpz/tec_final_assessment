"use client";
import { useState } from "react";
import api from "../utils/dataProvider.js";

export default function LoginPage() {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.login(user, password);
      if (data?.token) {
        // Mirror token in a cookie so server components / middleware can read it.
        // Use Secure in production (HTTPS) — drop it on localhost if needed.
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `authToken=${data.token}; path=/; max-age=3600; SameSite=Lax${secure}`;
        if (data.role) {
          document.cookie = `authRole=${data.role}; path=/; max-age=3600; SameSite=Lax${secure}`;
        }
        window.location.href = "/simulation";
      } else {
        setError("Unexpected response from server");
      }
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      if (e.status === 401) {
        setError("Invalid credentials");
      } else {
        setError(e.message || "Login failed");
      }
    } finally {
      setLoading(false);
    }
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

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-[10px] text-gray-400 tracking-widest mb-2">USER</label>
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              disabled={loading}
              className="w-full bg-white/5 border border-white/10 p-3 text-white focus:outline-none focus:border-white transition-all disabled:opacity-50"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-400 tracking-widest mb-2">PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="w-full bg-white/5 border border-white/10 p-3 text-white focus:outline-none focus:border-white transition-all disabled:opacity-50"
              required
            />
          </div>

          {error && (
            <p className="text-[10px] tracking-widest text-red-400 text-center">
              {error.toUpperCase()}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 border border-white text-white text-[10px] tracking-widest hover:bg-white hover:text-black transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "..." : "ENTER"}
          </button>
        </form>
      </div>
    </main>
  );
}