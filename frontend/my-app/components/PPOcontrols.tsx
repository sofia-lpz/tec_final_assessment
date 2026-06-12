"use client";

import { useState, useEffect } from "react";
import LoadSimulationModal from "./LoadSimulation";
import SaveSimulationModal from "./SaveSimulation";

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

// Dropdown para hiperparámetros con valores predefinidos
const SelectInput = ({ label, value, options, onChange }: { label: string; value: number; options: number[]; onChange: (v: number) => void }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-xs font-light tracking-wider text-gray-300">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full bg-white/5 border border-white/20 py-1 px-1 text-sm text-white focus:outline-none focus:border-white [&>option]:bg-black"
    >
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  </div>
);

// Campo numérico de floats con límite [-50, 50]. Permite escribir libremente y
// confirma el valor (con clamp) al perder el foco o presionar Enter.
const FloatInput = ({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (v: number) => void }) => {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = () => {
    const parsed = parseFloat(text);
    if (isNaN(parsed)) {
      setText(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    setText(String(clamped));
    onCommit(clamped);
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-light tracking-wider text-gray-300">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        min={min}
        max={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="w-full bg-white/5 border border-white/20 py-0.5 px-1 text-sm text-white focus:outline-none focus:border-white"
      />
    </div>
  );
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

  const [openSection, setOpenSection] = useState<"ppo" | "env" | "rewards" | "">("ppo");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

  const handleApply = () => console.log("Applying to simulation:", config);
  const handleSaveClick = () => setIsSaveModalOpen(true);
  const handleLoadClick = () => setIsModalOpen(true);

  const executeSave = async (name: string, configToSave: ConfigState) => {
    console.log(`Guardando simulación '${name}' en BD con config:`, configToSave);
    alert(`SIMULATION '${name}' SAVED SUCCESSFULLY`);
  };

  const applyLoadedConfig = (loadedConfig: any) => {
    setConfig(loadedConfig);
    console.log("Configuración cargada y aplicada al panel:", loadedConfig);
  };

  const updateConfig = (section: keyof ConfigState, field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [section]: { ...prev[section], [field]: value }
    }));
  };

  // 1. Sliders más compactos (quitamos espacio vertical innecesario)
  const SliderInput = ({ label, value, min, max, step, onChange }: any) => (
    <div className="flex flex-col gap-1.5">
      <label className="flex justify-between text-xs font-light tracking-wider text-gray-300 gap-1">
        <span className="truncate">{label}</span>
        <span className="shrink-0">{value}</span>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={onChange}
        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white" />
    </div>
  );

  // 2. Acordeones optimizados para menos "espacio muerto"
  const AccordionSection = ({ id, title, children }: { id: "ppo" | "env" | "rewards", title: string, children: React.ReactNode }) => {
    const isOpen = openSection === id;
    return (
      <div className="border-b border-white/10 last:border-0">
        <button
          onClick={() => setOpenSection(isOpen ? "" : id)}
          className="w-full flex justify-between items-center text-sm tracking-widest text-white/70 hover:text-white py-2.5 transition-colors"
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
            <div className="pt-1 pb-3 pl-1">
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="h-full max-h-full flex flex-col text-white bg-black/20 backdrop-blur-xl border border-white/90 p-4 lg:p-6 rounded-xl shadow-2xl overflow-hidden">
        
        <div className="mb-3 text-center border-b border-white/20 pb-3 shrink-0">
          <h2 className="text-base lg:text-lg font-light tracking-[0.15em] sm:tracking-widest leading-tight break-words">
            SIMULATION CONTROLS
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          
          <AccordionSection id="ppo" title="ALGORITHM SETUP">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-light tracking-wider text-gray-300">CRITIC TYPE</label>
                <div className="flex gap-2">
                  {["IPPO", "MAPPO"].map(type => (
                    <button key={type} onClick={() => updateConfig("ppo", "critic", type)}
                      className={`flex-1 py-1 text-xs border ${config.ppo.critic === type ? "bg-white text-black" : "border-white/40 hover:bg-white/10"}`}>
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <SelectInput label="LEARNING RATE" value={config.ppo.learningRate}
                options={[0.0001, 0.0003, 0.0005, 0.001, 0.003, 0.005, 0.01]}
                onChange={(v) => updateConfig("ppo", "learningRate", v)} />
              <SelectInput label="GAMMA" value={config.ppo.gamma}
                options={[0.8, 0.9, 0.95, 0.97, 0.99, 0.995, 0.999]}
                onChange={(v) => updateConfig("ppo", "gamma", v)} />
            </div>
          </AccordionSection>

          <AccordionSection id="env" title="ENVIRONMENT">
            {/* Margen ajustado (gap-y-2) */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {[
                { label: "AGENTS", key: "civilizations" }, { label: "STEPS", key: "maxSteps" },
                { label: "WIDTH", key: "width" }, { label: "HEIGHT", key: "height" },
                { label: "PLANETS", key: "planets" }, { label: "HARVEST RATE", key: "harvestRate" },
                { label: "INIT RES", key: "initialResources" }, { label: "INIT POP", key: "initialPopulation" }
              ].map(item => (
                <div key={item.key} className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400 tracking-wider truncate">{item.label}</label>
                  <input type="number" value={(config.env as any)[item.key]} 
                         onChange={(e) => updateConfig("env", item.key, parseFloat(e.target.value))}
                         className="w-full bg-white/5 border border-white/20 py-0.5 px-1 text-sm text-white focus:outline-none focus:border-white" />
                </div>
              ))}
            </div>
          </AccordionSection>

          <AccordionSection id="rewards" title="REWARD WEIGHTS">
            {/* Campos numéricos de floats, rango [-50, 50], etiquetas completas */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {Object.keys(config.rewards).map(key => (
                <FloatInput key={key} label={key.toUpperCase()} value={(config.rewards as any)[key]}
                            min={-50} max={50}
                            onCommit={(v) => updateConfig("rewards", key, v)} />
              ))}
            </div>
          </AccordionSection>

        </div>

        {/* Footer más compacto */}
        <div className="mt-3 pt-3 border-t border-white/20 shrink-0 flex flex-col gap-2">
          <button onClick={handleApply} className="w-full py-2 border border-white hover:bg-white hover:text-black text-[10px] sm:text-xs font-semibold tracking-widest transition-all duration-300 flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            APPLY & RESTART
          </button>
          
          <button onClick={handleSaveClick} className="w-full py-2 border border-white/40 hover:bg-white/10 transition-colors text-xs tracking-widest flex items-center justify-center gap-2">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            SAVE
          </button>
          <button onClick={handleLoadClick} className="w-full py-2 border border-white/40 hover:bg-white/10 transition-colors text-xs tracking-widest flex items-center justify-center gap-2">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            LOAD
          </button>
        </div>

      </div>

      <LoadSimulationModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onLoad={applyLoadedConfig} />
      <SaveSimulationModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} config={config} onSave={executeSave} />
    </>
  );
}