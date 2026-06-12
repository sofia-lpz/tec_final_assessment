"use client";

import { useState, useEffect, useCallback } from "react";
import { getScenariosByUser, deleteScenario, scenarioToConfig, ApiError, handleUnauthorized } from "../utils/dataProvider"; // adjust path to where dataProvider.js lives

// Metadatos del escenario cargado — el padre los guarda para "Save" vs "Save As"
export type LoadedScenarioMeta = { id: number; name: string };

// Tipos requeridos
type LoadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  /** Ahora también entrega { id, name } para que el padre sepa QUÉ simulación está abierta */
  onLoad: (config: any, meta: LoadedScenarioMeta) => void;
};

// Fila plana tal como llega de la tabla `scenarios`
type ScenarioRow = {
  id: number;
  name: string;
  created_at?: string;
  [key: string]: any;
};

const PAGE_SIZE = 5;

export default function LoadSimulationModal({ isOpen, onClose, onLoad }: LoadModalProps) {
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Borrado: confirmación inline en dos pasos + estado de petición
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchPage = useCallback(async (pageToLoad: number, signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const start = pageToLoad * PAGE_SIZE;
      const { data, total: count } = await getScenariosByUser(
        { start, end: start + PAGE_SIZE, sort: "id", order: "DESC" },
        { signal }
      );
      setScenarios(data);
      setTotal(count);
      // Si la página quedó vacía (p. ej. tras borrar registros), retrocede
      if (data.length === 0 && count > 0 && pageToLoad > 0) {
        setPage(Math.ceil(count / PAGE_SIZE) - 1);
      }
    } catch (err: any) {
      // Check for unauthorized error and handle it
      if (err instanceof ApiError && err.isUnauthorized) {
        await handleUnauthorized();
        return;
      }
      if (err instanceof ApiError && err.code === "CANCELLED") return;
      setError(err instanceof ApiError ? err.message : "Failed to fetch simulations");
      setScenarios([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Resetea a la primera página cada vez que se abre el modal
  useEffect(() => {
    if (isOpen) {
      setPage(0);
      setConfirmDeleteId(null);
      setDeleteError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetchPage(page, controller.signal);
    return () => controller.abort();
  }, [isOpen, page, fetchPage]);

  const handleDownload = (sim: ScenarioRow) => {
    const dataStr = JSON.stringify({ id: sim.id, name: sim.name, config: scenarioToConfig(sim) }, null, 2);
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

  const handleDelete = async (sim: ScenarioRow) => {
    setDeletingId(sim.id);
    setDeleteError(null);
    try {
      await deleteScenario(sim.id);
      setConfirmDeleteId(null);
      // Refresca la página actual; fetchPage retrocede si quedó vacía
      await fetchPage(page);
    } catch (err) {
      // Check for unauthorized error and handle it
      if (err instanceof ApiError && err.isUnauthorized) {
        await handleUnauthorized();
        return;
      }
      setDeleteError(
        err instanceof ApiError
          ? `COULD NOT DELETE "${sim.name.toUpperCase()}": ${err.message.toUpperCase()}`
          : "UNEXPECTED ERROR WHILE DELETING"
      );
    } finally {
      setDeletingId(null);
    }
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
          {deleteError && (
            <p className="mb-5 text-red-400 text-xs md:text-sm tracking-widest border border-red-400/30 bg-red-400/10 rounded-lg px-4 py-3">
              {deleteError}
            </p>
          )}
          {isLoading ? (
            <div className="text-center text-white/50 text-sm md:text-base tracking-widest py-16 animate-pulse">
              FETCHING RECORDS...
            </div>
          ) : error ? (
            <div className="text-center py-16 flex flex-col items-center gap-4">
              <p className="text-red-400 text-sm md:text-base tracking-widest">{error}</p>
              <button
                onClick={() => fetchPage(page)}
                className="px-6 py-2 border border-white/40 text-white/70 hover:text-white hover:border-white text-xs tracking-widest transition-all rounded-sm"
              >
                RETRY
              </button>
            </div>
          ) : scenarios.length === 0 ? (
            <div className="text-center text-white/50 text-sm md:text-base tracking-widest py-16">
              NO PAST SIMULATIONS FOUND
            </div>
          ) : (
            <div className="space-y-4 md:space-y-5">
              {scenarios.map((sim) => (
                <div
                  key={sim.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-5 md:p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors gap-4"
                >
                  <div>
                    <h4 className="text-white text-sm md:text-base font-medium tracking-wide">
                      {sim.name}
                    </h4>
                    <p className="text-white/50 text-[11px] md:text-xs tracking-widest mt-2">
                      {sim.created_at && (
                        <>DATE: {new Date(sim.created_at).toLocaleDateString()} <span className="mx-2 text-white/20">|</span> </>
                      )}
                      ID: {sim.id}
                    </p>
                  </div>

                  {/* Botones siempre visibles y escalados tipográficamente */}
                  <div className="flex gap-3">
                    {confirmDeleteId === sim.id ? (
                      <>
                        {/* Confirmación de borrado en dos pasos */}
                        <button
                          onClick={() => handleDelete(sim)}
                          disabled={deletingId === sim.id}
                          className="flex-1 sm:flex-none justify-center px-4 md:px-5 py-2.5 bg-red-500/90 text-white text-xs md:text-sm tracking-widest font-bold flex items-center gap-2 hover:bg-red-500 transition-colors rounded-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {deletingId === sim.id ? (
                            <>
                              <svg className="w-3.5 h-3.5 md:w-4 md:h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                              </svg>
                              DELETING...
                            </>
                          ) : (
                            "CONFIRM DELETE"
                          )}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={deletingId === sim.id}
                          className="flex-1 sm:flex-none justify-center px-4 md:px-5 py-2.5 border border-white/20 text-white/70 hover:text-white hover:border-white text-xs md:text-sm tracking-widest flex items-center transition-all rounded-sm disabled:opacity-30"
                        >
                          CANCEL
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setConfirmDeleteId(sim.id); setDeleteError(null); }}
                          className="flex-1 sm:flex-none justify-center px-4 md:px-5 py-2.5 border border-red-400/30 text-red-400/80 hover:text-red-400 hover:border-red-400 text-xs md:text-sm tracking-widest flex items-center gap-2 transition-all rounded-sm"
                          title="Delete simulation"
                        >
                          <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          DELETE
                        </button>
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
                            // Entrega config + metadatos para que el padre muestre el nombre
                            // y habilite "SAVE" (update) sobre este escenario
                            onLoad(scenarioToConfig(sim), { id: sim.id, name: sim.name });
                            onClose();
                          }}
                          className="flex-1 sm:flex-none justify-center px-6 md:px-8 py-2.5 bg-white text-black text-xs md:text-sm tracking-widest font-bold flex items-center gap-2 hover:bg-gray-200 transition-colors rounded-sm"
                        >
                          <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          </svg>
                          LOAD
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer de paginación */}
        {!error && total > PAGE_SIZE && (
          <div className="px-6 md:px-8 py-4 border-t border-white/10 bg-white/5 shrink-0 flex items-center justify-between">
            <span className="text-white/40 text-[11px] md:text-xs tracking-widest">
              {total} SIMULATION{total === 1 ? "" : "S"}
            </span>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0 || isLoading}
                className="px-4 py-1.5 border border-white/20 text-white/70 hover:text-white hover:border-white disabled:opacity-30 disabled:hover:text-white/70 disabled:hover:border-white/20 disabled:cursor-not-allowed text-xs tracking-widest transition-all rounded-sm"
              >
                ‹ PREV
              </button>
              <span className="text-white/50 text-[11px] md:text-xs tracking-widest whitespace-nowrap">
                PAGE {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || isLoading}
                className="px-4 py-1.5 border border-white/20 text-white/70 hover:text-white hover:border-white disabled:opacity-30 disabled:hover:text-white/70 disabled:hover:border-white/20 disabled:cursor-not-allowed text-xs tracking-widest transition-all rounded-sm"
              >
                NEXT ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}