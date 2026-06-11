"use client";

import { useState } from "react";

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

export default function PPOControls() {
  const [config, setConfig] = useState<ConfigState>({
    ppo: { learningRate: 0.001, gamma: 0.99, critic: "MAPPO" },
    env: {
      civilizations: 5, width: 100, height: 100,
      planets: 20, harvestRate: 1.5, initialResources: 500,
      initialPopulation: 100, maxSteps: 1000
    },
    rewards: {
      broadcast: -5, destroyed: -10, conquer: 10,
      colonize: 8, survive: 1, population: 0.5,
      science: 3, explore: 2, invalid: -2
    }
  });

  // Corrección de TypeScript: Se añade "" al tipo
  const [openSection, setOpenSection] = useState<"ppo" | "env" | "rewards" | "">("ppo");

  const handleApply = () => console.log("Applying to simulation:", config);
  const handleSave = async () => alert("Parámetros guardados (Simulado)");
  const handleLoad = async () => alert("Abre modal de historial (Simulado)");

  const updateConfig = (section: keyof ConfigState, field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value }
    }));
  };

  const SliderInput = ({ label, value, min, max, step, onChange }: any) => (
    <div className="space-y-2">
      <label className="flex justify-between text-[9px] lg:text-[10px] font-light tracking-wider text-gray-300 gap-2">
        <span className="truncate">{label}</span>
        <span className="shrink-0">{value}</span>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={onChange}
        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white" />
    </div>
  );

  // Componente interno para manejar la animación del acordeón
  const AccordionSection = ({ id, title, children }: { id: "ppo" | "env" | "rewards", title: string, children: React.ReactNode }) => {
    const isOpen = openSection === id;
    return (
      <div className="border-b border-white/10 last:border-0">
        <button
          onClick={() => setOpenSection(isOpen ? "" : id)}
          className="w-full flex justify-between items-center text-xs tracking-widest text-white/70 hover:text-white py-3 transition-colors"
        >
          <span>{title}</span>
          <svg 
            className={`w-3 h-3 transform transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} 
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div 
          className={`grid transition-all duration-300 ease-in-out ${
            isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="pt-2 pb-4 pl-2">
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full max-h-full flex flex-col text-white bg-black/20 backdrop-blur-xl border border-white/90 p-4 sm:p-6 lg:p-8 rounded-xl shadow-2xl overflow-hidden">
      
      {/* HEADER FIJO */}
      <div className="mb-4 text-center border-b border-white/20 pb-4 shrink-0">
        <h2 className="text-base sm:text-lg lg:text-xl font-light tracking-[0.15em] sm:tracking-widest leading-tight break-words">
          SIMULATION CONTROLS
        </h2>
      </div>
      
      {/* CONTENEDOR DE PARÁMETROS CON SCROLL INDEPENDIENTE */}
      <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/20">
        
        <AccordionSection id="ppo" title="ALGORITHM SETUP">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[9px] lg:text-[10px] font-light tracking-wider text-gray-300">CRITIC TYPE</label>
              <div className="flex gap-2">
                {["IPPO", "MAPPO"].map(type => (
                  <button key={type} onClick={() => updateConfig("ppo", "critic", type)}
                    className={`flex-1 py-1 text-[10px] border ${config.ppo.critic === type ? "bg-white text-black" : "border-white/40 hover:bg-white/10"}`}>
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <SliderInput label="LEARNING RATE" value={config.ppo.learningRate} min="0.0001" max="0.01" step="0.0001" onChange={(e: any) => updateConfig("ppo", "learningRate", parseFloat(e.target.value))} />
            <SliderInput label="GAMMA" value={config.ppo.gamma} min="0.8" max="0.999" step="0.001" onChange={(e: any) => updateConfig("ppo", "gamma", parseFloat(e.target.value))} />
          </div>
        </AccordionSection>

        <AccordionSection id="env" title="ENVIRONMENT">
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "AGENTS", key: "civilizations" }, { label: "STEPS", key: "maxSteps" },
              { label: "WIDTH", key: "width" }, { label: "HEIGHT", key: "height" },
              { label: "PLANETS", key: "planets" }, { label: "HARVEST RATE", key: "harvestRate" },
              { label: "INIT RES", key: "initialResources" }, { label: "INIT POP", key: "initialPopulation" }
            ].map(item => (
              <div key={item.key} className="space-y-1">
                <label className="text-[9px] text-gray-400 tracking-wider truncate block">{item.label}</label>
                <input type="number" value={(config.env as any)[item.key]} 
                       onChange={(e) => updateConfig("env", item.key, parseFloat(e.target.value))}
                       className="w-full bg-white/5 border border-white/20 p-1 text-xs text-white focus:outline-none focus:border-white" />
              </div>
            ))}
          </div>
        </AccordionSection>

        <AccordionSection id="rewards" title="REWARD WEIGHTS">
          <div className="space-y-4">
            {Object.keys(config.rewards).map(key => (
              <SliderInput key={key} label={key.toUpperCase()} value={(config.rewards as any)[key]} 
                           min="-20" max="20" step="0.5" 
                           onChange={(e: any) => updateConfig("rewards", key, parseFloat(e.target.value))} />
            ))}
          </div>
        </AccordionSection>

      </div>

      {/* ÁREA DE ACCIÓN INFERIOR FIJA */}
      <div className="mt-4 pt-4 border-t border-white/20 shrink-0 space-y-3">
        <button onClick={handleApply} className="w-full py-2 lg:py-3 border border-white hover:bg-white hover:text-black text-[10px] sm:text-xs lg:text-sm font-semibold tracking-widest transition-all duration-300 flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          APPLY & RESTART
        </button>
        
        <div className="flex gap-3">
          <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 py-2 border border-white/40 hover:bg-white/10 transition-colors text-[9px] tracking-widest">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            SAVE
          </button>
          <button onClick={handleLoad} className="flex-1 flex items-center justify-center gap-2 py-2 border border-white/40 hover:bg-white/10 transition-colors text-[9px] tracking-widest">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            LOAD
          </button>
        </div>
      </div>

    </div>
  );
}