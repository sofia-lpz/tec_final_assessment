"use client";

import React, { useEffect, useState } from "react";
import PPOControls from "@/components/PPOcontrols";
import GraficasContainer from "@/components/Graphics";
import Header from "@/components/Header";
import Galaxy from "@/components/Galaxy";
import Footer from "@/components/Footer";
import PlanetStatesSection from "@/components/PlanetStatesSection";
import { getToken } from "../../utils/dataProvider.js";

// Optimizamos renderizado
const SolarSystemMemo = React.memo(Galaxy);
const GraphicsMemo = React.memo(GraficasContainer);

export default function SimulationPage() {
  // null  = still checking
  // false = not authenticated → redirect
  // true  = authenticated → render
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    // getToken() reads from localStorage (client-only).
    // We defer to useEffect so this never runs on the server.
    const token = getToken();
    if (!token) {
      // No valid session — send to login immediately.
      window.location.replace("/");
    } else {
      setAuthed(true);
    }
  }, []);

  // Blank screen while the check runs (avoids a flash of protected content).
  if (!authed) return null;

  return (
    <>
      <Header />

      <main className="pt-20 md:pt-28 lg:pt-32 px-4 sm:px-6 lg:px-8 w-full min-h-screen">
        
        <div className="flex flex-col gap-4 sm:gap-6 w-full">
             
             {/* FILA SUPERIOR: Simulación + Controles */}
             <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 w-full min-h-[50vh] lg:h-[70vh]">
                 
                 {/* Galaxy */}
                 <div className="flex-1 w-full rounded-xl overflow-hidden border border-white/20 bg-white/5 relative min-h-[40vh] lg:min-h-0">
                   <SolarSystemMemo />
                 </div>

                 {/* PPOControls */}
                 <div className="w-full lg:w-80 xl:w-96 shrink-0 h-full max-h-full">
                   <PPOControls />
                 </div>
             </div>

             {/* FILA INFERIOR: Gráficas de Métricas */}
             <div className="w-full">
               <GraphicsMemo />
             </div>

             <div className="w-full">
               <PlanetStatesSection />
             </div>
             
        </div>
      </main>
      <Footer />
    </>
  );
}