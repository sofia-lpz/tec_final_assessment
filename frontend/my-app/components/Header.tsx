"use client";

export default function Header({ children }: { children: React.ReactNode }) {
  const handleSignOut = () => {
    // Sobreescribimos la cookie con una fecha que ya pasó (1970) para que el navegador la elimine
    document.cookie = "authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    
    // Redirigimos al inicio (Login)
    window.location.href = "/";
  };

  return (
    <header className="fixed top-0 w-full z-50 h-16 md:h-20 lg:h-24 px-4 md:px-8 lg:px-12 bg-black/50 backdrop-blur-md border-b border-white/10 flex items-center justify-between">
      
      <div className="flex-1 justify-start hidden sm:flex"></div>

      <div className="flex-auto flex justify-center">
        <h1 className="text-white font-black tracking-widest text-2xl md:text-4xl lg:text-5xl whitespace-nowrap">
          DARK FOREST
        </h1>
      </div>

      {/* Actualizamos este contenedor para que tenga los children y el botón */}
      <div className="flex-1 flex justify-end items-center gap-4 sm:gap-6">
        {children}
        <button 
          onClick={handleSignOut}
          className="text-[9px] sm:text-[10px] md:text-xs text-white/70 hover:text-white border border-white/20 hover:border-white px-3 py-1.5 sm:px-4 sm:py-2 transition-all tracking-widest"
        >
          SIGN OUT
        </button>
      </div>
      
    </header>
  );
}