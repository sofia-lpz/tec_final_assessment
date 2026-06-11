"use client";
import { useState } from "react";

export default function LoginPage() {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    // DUMMY TEMPORAL ---
    if (user === "admin" && password === "1234") {
      // creamos una cookie de autenticación (simulada)
      document.cookie = "authToken=token_dummy_12345; path=/; max-age=86400";
      // redireccionamos a la simulación
      window.location.href = "/simulation"; 
    } else {
      alert("Credenciales incorrectas (Usa: admin / 1234)");
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-black overflow-hidden w-full">
      {/* Fondo espacial difuminado */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(255,255,255,0.05)_0%,_transparent_70%)] animate-pulse" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[128px]" />

      {/* Formulario Glassmorphism */}
      <div className="w-full max-w-sm p-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-10">
        <h2 className="text-2xl font-light text-white text-center mb-8 tracking-[0.2em]">DARK FOREST</h2>
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-[10px] text-gray-400 tracking-widest mb-2">USER</label>
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className="w-full bg-white/5 border border-white/10 p-3 text-white focus:outline-none focus:border-white transition-all"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-400 tracking-widest mb-2">PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-white/10 p-3 text-white focus:outline-none focus:border-white transition-all"
              required
            />
          </div>
          <button type="submit" className="w-full py-3 border border-white text-white text-[10px] tracking-widest hover:bg-white hover:text-black transition-all duration-300">
            ENTER
          </button>
        </form>
      </div>
    </main>
  );
}