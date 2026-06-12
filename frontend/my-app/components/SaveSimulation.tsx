"use client";

import { useState, useEffect } from "react";

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

  // Bloque de información rediseñado para mayor legibilidad
  const InfoBlock = ({ title, data }: { title: string, data: Record<string, string | number> }) => (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5 md:p-6">
      <h4 className="text-xs md:text-sm text-white/50 tracking-[0.2em] mb-4 border-b border-white/10 pb-3">
        {title}
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-3">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex justify-between items-center border-b border-white/5 pb-2">
            <span className="text-gray-400 uppercase text-[11px] md:text-xs tracking-widest truncate pr-3">
              {key.replace(/([A-Z])/g, ' $1').trim()}
            </span>
            <span className="text-white font-medium shrink-0 text-xs md:text-sm">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 sm:p-8">
      
      {/* Contenedor más amplio (max-w-4xl) y con bordes más redondeados (rounded-2xl) */}
      <div className="w-full max-w-4xl bg-black/50 border border-white/20 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="px-6 md:px-8 py-5 border-b border-white/10 flex justify-between items-center bg-white/5 shrink-0">
          <h3 className="text-white text-base md:text-lg tracking-[0.2em] font-light">
            SAVE SIMULATION
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

        {/* Contenido (Scrollable) */}
        <div className="p-6 md:p-8 flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 space-y-8">
          
          {/* Input para el nombre */}
          <div className="space-y-3">
            <label className="block text-xs md:text-sm text-gray-400 tracking-widest">
              SIMULATION NAME
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Exploration V1"
              className="w-full bg-black/50 border border-white/20 p-4 text-base md:text-lg text-white focus:outline-none focus:border-white transition-colors rounded-lg placeholder:text-white/20 tracking-wide"
              autoFocus
            />
          </div>

          {/* Resumen de configuración a guardar */}
          <div className="space-y-5">
            <h4 className="text-xs md:text-sm text-white/50 tracking-[0.2em] pt-2">
              PARAMETERS SNAPSHOT
            </h4>
            
            <InfoBlock title="ALGORITHM SETUP" data={config.ppo} />
            <InfoBlock title="ENVIRONMENT CONFIGURATION" data={config.env} />
            <InfoBlock title="REWARD WEIGHTS" data={config.rewards} />
          </div>

        </div>

        {/* Footer (Acciones) */}
        <div className="px-6 md:px-8 py-5 border-t border-white/10 bg-white/5 flex flex-col-reverse sm:flex-row gap-4 shrink-0 justify-end">
          <button 
            onClick={onClose}
            className="px-8 py-3 border border-white/20 text-white/70 hover:text-white hover:border-white text-xs md:text-sm tracking-widest transition-all rounded-sm"
          >
            CANCEL
          </button>
          <button 
            onClick={handleConfirmSave}
            className="px-8 py-3 bg-white text-black text-xs md:text-sm tracking-widest font-bold flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors rounded-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            CONFIRM SAVE
          </button>
        </div>

      </div>
    </div>
  );
}