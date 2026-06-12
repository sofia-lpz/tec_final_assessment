"use client";

import { useState, useEffect } from "react";

// Tipos requeridos
type LoadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (config: any) => void;
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
    config: { ppo: { learningRate: 0.001 }, env: { civilizations: 5 } } 
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
      setIsLoading(true);
      setTimeout(() => {
        setSimulations(DUMMY_HISTORY);
        setIsLoading(false);
      }, 500);
    }
  }, [isOpen]);

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-8">
      
      {/* Contenedor más amplio (max-w-4xl) y bordes redondeados (rounded-2xl) para mantener paridad con SaveModal */}
      <div className="w-full max-w-4xl bg-black/50 border border-white/20 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header del Modal */}
        <div className="px-6 md:px-8 py-5 border-b border-white/10 flex justify-between items-center bg-white/5 shrink-0">
          <h3 className="text-white text-base md:text-lg tracking-[0.2em] font-light">
            LOAD PAST SIMULATION
          </h3>
          <button 
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
          >
            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Cuerpo del Modal (Lista con Scroll) */}
        <div className="p-6 md:p-8 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20">
          {isLoading ? (
            <div className="text-center text-white/50 text-sm md:text-base tracking-widest py-16 animate-pulse">
              FETCHING RECORDS...
            </div>
          ) : simulations.length === 0 ? (
            <div className="text-center text-white/50 text-sm md:text-base tracking-widest py-16">
              NO PAST SIMULATIONS FOUND
            </div>
          ) : (
            <div className="space-y-4 md:space-y-5">
              {simulations.map((sim) => (
                <div 
                  key={sim.id} 
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-5 md:p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors gap-4"
                >
                  <div>
                    <h4 className="text-white text-sm md:text-base font-medium tracking-wide">
                      {sim.name}
                    </h4>
                    <p className="text-white/50 text-[11px] md:text-xs tracking-widest mt-2">
                      DATE: {sim.date} <span className="mx-2 text-white/20">|</span> ID: {sim.id.split('_')[1]}
                    </p>
                  </div>
                  
                  {/* Botones siempre visibles y escalados tipográficamente */}
                  <div className="flex gap-3">
                    <button 
                      onClick={() => handleDownload(sim)}
                      className="flex-1 sm:flex-none justify-center px-4 md:px-5 py-2.5 border border-white/20 text-white/70 hover:text-white hover:border-white text-xs md:text-sm tracking-widest flex items-center gap-2 transition-all rounded-sm"
                      title="Download JSON"
                    >
                      <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      EXPORT
                    </button>
                    <button 
                      onClick={() => {
                        onLoad(sim.config);
                        onClose();
                      }}
                      className="flex-1 sm:flex-none justify-center px-6 md:px-8 py-2.5 bg-white text-black text-xs md:text-sm tracking-widest font-bold flex items-center gap-2 hover:bg-gray-200 transition-colors rounded-sm"
                    >
                      <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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