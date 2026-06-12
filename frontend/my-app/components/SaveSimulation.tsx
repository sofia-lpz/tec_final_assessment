"use client";

import { useState, useEffect } from "react";
import dataProvider, { ApiError } from "@/utils/dataProvider";

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

/**
 * Flatten the nested UI config into the exact shape the backend's
 * validateScenarioData requires (controller.js): flat snake_case keys.
 * Missing any of these → 400 "Missing required fields".
 */
const toScenarioPayload = (name: string, config: ConfigState) => ({
  name,
  // PPO
  critic: config.ppo.critic,
  learning_rate: config.ppo.learningRate, // not validated by the backend —
  gamma: config.ppo.gamma,                // remove if service.js rejects extras
  // Environment
  civilizations: config.env.civilizations,
  map_width: config.env.width,
  map_height: config.env.height,
  planets: config.env.planets,
  harvest_rate: config.env.harvestRate,
  initial_resources: config.env.initialResources,
  initial_population: config.env.initialPopulation,
  max_steps: config.env.maxSteps,
  // Rewards
  broadcast_reward: config.rewards.broadcast,
  destroyed_reward: config.rewards.destroyed,
  conquer_reward: config.rewards.conquer,
  colonize_reward: config.rewards.colonize,
  survive_reward: config.rewards.survive,
  population_reward: config.rewards.population,
  science_reward: config.rewards.science,
  explore_reward: config.rewards.explore,
  invalid_reward: config.rewards.invalid,
});

type SaveModalProps = {
  isOpen: boolean;
  onClose: () => void;
  config: ConfigState;
  /** Called after the scenario was successfully persisted via the API.
   *  Receives the server response (e.g. the created scenario / its id)
   *  so the parent can refresh its saved-scenarios list. */
  onSaved?: (created: unknown, name: string, config: ConfigState) => void;
};

export default function SaveSimulationModal({ isOpen, onClose, config, onSaved }: SaveModalProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setError(null);
      setSaving(false);
    }
  }, [isOpen]);

  const handleConfirmSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("PLEASE ENTER A SIMULATION NAME");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // POST /scenarios — dataProvider wraps this as { scenario: ... } and
      // attaches the Bearer token. The controller validates the flat shape.
      const created = await dataProvider.createScenario(
        toScenarioPayload(trimmed, config)
      );

      onSaved?.(created, trimmed, config);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "NOT_AUTHENTICATED" || err.isUnauthorized) {
          setError("YOUR SESSION HAS EXPIRED — PLEASE LOG IN AGAIN");
        } else if (err.isTimeout) {
          setError("THE SERVER TOOK TOO LONG TO RESPOND. TRY AGAIN.");
        } else if (err.isNetworkError) {
          setError("NETWORK ERROR — CHECK YOUR CONNECTION");
        } else {
          setError(err.message.toUpperCase());
        }
      } else {
        setError("UNEXPECTED ERROR WHILE SAVING");
      }
    } finally {
      setSaving(false);
    }
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
            disabled={saving}
            className="text-white/50 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none"
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
              onChange={(e) => { setName(e.target.value); if (error) setError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !saving) handleConfirmSave(); }}
              placeholder="e.g. Standard Exploration V1"
              disabled={saving}
              className="w-full bg-black/50 border border-white/20 p-4 text-base md:text-lg text-white focus:outline-none focus:border-white transition-colors rounded-lg placeholder:text-white/20 tracking-wide disabled:opacity-50"
              autoFocus
            />
            {error && (
              <p className="text-red-400 text-xs md:text-sm tracking-widest border border-red-400/30 bg-red-400/10 rounded-lg px-4 py-3">
                {error}
              </p>
            )}
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
            disabled={saving}
            className="px-8 py-3 border border-white/20 text-white/70 hover:text-white hover:border-white text-xs md:text-sm tracking-widest transition-all rounded-sm disabled:opacity-30 disabled:pointer-events-none"
          >
            CANCEL
          </button>
          <button
            onClick={handleConfirmSave}
            disabled={saving}
            className="px-8 py-3 bg-white text-black text-xs md:text-sm tracking-widest font-bold flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors rounded-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                SAVING...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                CONFIRM SAVE
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}