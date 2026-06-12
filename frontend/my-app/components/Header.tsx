"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import SignOutModal from "./SignOutModal";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  
  // Estado para controlar la visibilidad del modal
  const [isSignOutOpen, setIsSignOutOpen] = useState(false);

  // La lógica real de salida se mantiene igual, pero ahora será llamada por el modal
  const executeSignOut = () => {
    document.cookie = "authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    router.push("/");
    router.refresh();
  };

  const getNavStyle = (path: string) => {
    const isActive = pathname === path;
    
    return `text-[9px] sm:text-[10px] md:text-xs px-3 py-1.5 sm:px-4 sm:py-2 transition-all tracking-widest border ${
      isActive 
        ? "bg-white text-black border-white font-bold" 
        : "text-white/70 hover:text-white border-white/20 hover:border-white"
    }`;
  };

  return (
    <>
      <header className="fixed top-0 w-full z-50 h-16 md:h-20 lg:h-24 px-4 md:px-8 lg:px-12 bg-black/50 backdrop-blur-md border-b border-white/10 flex items-center justify-between">
        
        <div className="flex-1 justify-start hidden sm:flex"></div>

        <div className="flex-auto flex justify-center">
          <h1 className="text-white font-black tracking-widest text-2xl md:text-4xl lg:text-5xl whitespace-nowrap">
            DARK FOREST
          </h1>
        </div>

        <div className="flex-1 flex justify-end items-center gap-3 sm:gap-4">
          
          <Link href="/simulation" className={getNavStyle("/simulation")}>
            SIMULATION
          </Link>
          
          <Link href="/theory" className={getNavStyle("/theory")}>
            THEORY
          </Link>
          
          <div className="w-px h-6 bg-white/20 hidden sm:block mx-1"></div>
          
          {/* Este botón ahora solo abre el modal */}
          <button 
            onClick={() => setIsSignOutOpen(true)}
            className="text-[9px] sm:text-[10px] md:text-xs text-white/70 border border-white/20 px-3 py-1.5 sm:px-4 sm:py-2 transition-all duration-300 tracking-widest hover:bg-red-900/80 hover:text-white hover:border-red-500"
          >
            SIGN OUT
          </button>
          
        </div>
      </header>

      {/* Renderizado del Modal fuera del flujo del Header */}
      <SignOutModal 
        isOpen={isSignOutOpen} 
        onClose={() => setIsSignOutOpen(false)} 
        onConfirm={executeSignOut} 
      />
    </>
  );
}