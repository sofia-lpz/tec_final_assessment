"use client";

import { useState, useEffect } from "react";

// Tipos requeridos (deben coincidir con tu ConfigState)
type ConfigState = {
  ppo: { learningRate: number; gamma: number; critic: "IPPO" | "MAPPO" };
  env: {
    civilizations: number; width: number; height: number;
    planets: number; harvestRate: number; initialResources: number;
    initialPopulation: number; maxSteps: number;
  };
  rewards: {
    broadcast: number; destroyed: number; conquer: number;
    colonize: number; survive: number; population: number;
    science: number; explore: number; invalid: number;
  };
};

type SaveModalProps = {
  isOpen: boolean;
  onClose: () => void;
  config: ConfigState;
  onSave: (name: string, configToSave: ConfigState) => void;
};

export default function SaveSimulationModal({ isOpen, onClose, config, onSave }: SaveModalProps) {
  const [name, setName] = useState("");

  // Limpiar el input cada vez que se abre el modal
  useEffect(() => {
    if (isOpen) {
      setName("");
    }
  }, [isOpen]);

  const handleConfirmSave = () => {
    if (!name.trim()) {
      alert("PLEASE ENTER A SIMULATION NAME");
      return;
    }
    onSave(name, config);
    onClose();
  };

  if (!isOpen) return null;

  // Función de ayuda para renderizar los bloques de información
  const InfoBlock = ({ title, data }: { title: string, data: Record<string, string | number> }) => (
    <div className="bg-white/5 border border-white/10 rounded-lg p-4">
      <h4 className="text-[10px] text-white/50 tracking-[0.2em] mb-3 border-b border-white/10 pb-2">
        {title}
      </h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex justify-between items-center text-[10px] tracking-widest">
            <span className="text-gray-400 uppercase truncate pr-2">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
            <span className="text-white font-medium shrink-0">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      
      <div className="w-full max-w-2xl bg-black/40 border border-white/20 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-white/5 shrink-0">
          <h3 className="text-white text-sm tracking-[0.2em] font-light">
            SAVE SIMULATION
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

        {/* Contenido (Scrollable) */}
        <div className="p-6 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 space-y-6">
          
          {/* Input para el nombre */}
          <div className="space-y-2">
            <label className="block text-[10px] text-gray-400 tracking-widest">SIMULATION NAME</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Exploration V1"
              className="w-full bg-black/50 border border-white/20 p-3 text-sm text-white focus:outline-none focus:border-white transition-colors rounded-none placeholder:text-white/20 tracking-wide"
              autoFocus
            />
          </div>

          {/* Resumen de configuración a guardar */}
          <div className="space-y-4">
            <h4 className="text-[10px] text-white/50 tracking-[0.2em] pt-2">PARAMETERS SNAPSHOT</h4>
            
            <InfoBlock title="ALGORITHM SETUP" data={config.ppo} />
            <InfoBlock title="ENVIRONMENT CONFIGURATION" data={config.env} />
            <InfoBlock title="REWARD WEIGHTS" data={config.rewards} />
          </div>

        </div>

        {/* Footer (Acciones) */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/5 flex gap-4 shrink-0 justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white text-[10px] tracking-widest transition-all"
          >
            CANCEL
          </button>
          <button 
            onClick={handleConfirmSave}
            className="px-6 py-2 bg-white text-black text-[10px] tracking-widest font-bold flex items-center gap-2 hover:bg-gray-200 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            CONFIRM SAVE
          </button>
        </div>

      </div>
    </div>
  );
}