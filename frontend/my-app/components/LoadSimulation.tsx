"use client";

import { useState, useEffect } from "react";

// Tipos requeridos
type LoadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (config: any) => void; // Recibe la configuración para inyectarla en la app
};

type SavedSimulation = {
  id: string;
  name: string;
  date: string;
  config: any;
};

// Datos simulados (Esto provendría de tu API /api/simulations/history)
const DUMMY_HISTORY: SavedSimulation[] = [
  {
    id: "sim_1",
    name: "Standard Exploration",
    date: "2026-06-10",
    config: { ppo: { learningRate: 0.001 }, env: { civilizations: 5 } } // Parcial para el ejemplo
  },
  {
    id: "sim_2",
    name: "Aggressive Expansion",
    date: "2026-06-11",
    config: { ppo: { learningRate: 0.005 }, env: { civilizations: 10 } }
  }
];

export default function LoadSimulationModal({ isOpen, onClose, onLoad }: LoadModalProps) {
  const [simulations, setSimulations] = useState<SavedSimulation[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Simulación de llamada fetch a tu backend
      setIsLoading(true);
      setTimeout(() => {
        setSimulations(DUMMY_HISTORY);
        setIsLoading(false);
      }, 500);
    }
  }, [isOpen]);

  // Lógica para descargar el JSON localmente sin llamar al backend
  const handleDownload = (sim: SavedSimulation) => {
    const dataStr = JSON.stringify(sim, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `dark_forest_${sim.name.replace(/\s+/g, '_').toLowerCase()}.json`;
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      {/* Contenedor del Modal */}
      <div className="w-full max-w-2xl bg-black/40 border border-white/20 rounded-xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        
        {/* Header del Modal */}
        <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-white/5">
          <h3 className="text-white text-sm tracking-[0.2em] font-light">
            LOAD PAST SIMULATION
          </h3>
          <button 
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Cuerpo del Modal (Lista con Scroll) */}
        <div className="p-6 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20">
          {isLoading ? (
            <div className="text-center text-white/50 text-xs tracking-widest py-10 animate-pulse">
              FETCHING RECORDS...
            </div>
          ) : simulations.length === 0 ? (
            <div className="text-center text-white/50 text-xs tracking-widest py-10">
              NO PAST SIMULATIONS FOUND
            </div>
          ) : (
            <div className="space-y-3">
              {simulations.map((sim) => (
                <div 
                  key={sim.id} 
                  className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors group"
                >
                  <div>
                    <h4 className="text-white text-sm font-medium tracking-wide">{sim.name}</h4>
                    <p className="text-white/50 text-[10px] tracking-widest mt-1">
                      DATE: {sim.date} | ID: {sim.id.split('_')[1]}
                    </p>
                  </div>
                  
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleDownload(sim)}
                      className="px-3 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white text-[10px] tracking-widest flex items-center gap-2 transition-all"
                      title="Download JSON"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      EXPORT
                    </button>
                    <button 
                      onClick={() => {
                        onLoad(sim.config);
                        onClose();
                      }}
                      className="px-4 py-2 bg-white text-black text-[10px] tracking-widest font-bold flex items-center gap-2 hover:bg-gray-200 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      </svg>
                      LOAD
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}