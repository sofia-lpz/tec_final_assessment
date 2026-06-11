import Link from "next/link";

export default function Footer() {
  return (
    <footer className="w-full bg-black/50 backdrop-blur-md border-t border-white/10 text-xs text-gray-400 py-8 px-6 md:px-12">
      <div className="max-w-7xl mx-auto flex flex-col gap-8">
        
        {/* SECCIÓN SUPERIOR: Enlaces organizados */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          
          {/* Columna 1: Branding / Info corta */}
          <div className="col-span-2 md:col-span-1 flex flex-col gap-2">
            <span className="text-white font-semibold text-sm tracking-wider">DARK FOREST</span>
            <p className="text-gray-500 max-w-xs">
              Proximal Policy Optimization (PPO) applied to a space-themed simulation. Explore the dark forest of AI training!      
            </p>
          </div>

          {/* Columna 2: Comunidad / Código */}
          <div className="flex flex-col gap-2">
            <span className="text-white font-medium">Comunidad</span>
            <a 
              href="https://guthib.com/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="hover:text-white transition-colors flex items-center gap-1"
            >
              GitHub Repository
            </a>
          </div>
        </div>

        {/* SECCIÓN INFERIOR: Built by (Lista de 4 usuarios) */}
        <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
          <span className="text-white font-medium">Built by</span>
          <div className="flex flex-wrap gap-x-2 gap-y-1 text-gray-400">
            <a href="https://github.com/sofia-lpz" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors underline underline-offset-2">
                sofia-lpz
            </a>
            <span>•</span>
            <a href="https://github.com/rintintingoesbrrr" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors underline underline-offset-2">
              rintintingoesbrrr
            </a>
            <span>•</span>
            <a href="https://github.com/HJZR2004" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors underline underline-offset-2">
              HJZR2004
            </a>
            <span>•</span>
            <a href="https://github.com/luisda25" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors underline underline-offset-2">
              luisda25
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
}