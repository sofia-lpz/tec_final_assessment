"use client";
import { useState } from "react";
import React from "react";
import SolarSystem from "@/components/SolarSystem";
import PPOControls from "@/components/PPOcontrols";
import GraficasContainer from "@/components/Graphics";
import Header from "@/components/Header";
import ToggleSwitch from "@/components/Switch";
import Galaxy from "@/components/Galaxy";

// Optimizamos renderizado
const SolarSystemMemo = React.memo(Galaxy);
const GraphicsMemo = React.memo(GraficasContainer);

export default function Home() {
  const [isTheory, setIsTheory] = useState(false);

  return (
    <>
      <Header>
        <ToggleSwitch isOn={isTheory} onToggle={() => setIsTheory(!isTheory)} />
      </Header>

      <main className="pt-20 md:pt-28 lg:pt-32 px-4 sm:px-6 lg:px-8 w-full min-h-screen">
        
        {/* Vista Teoría */}
        <div className={!isTheory ? "hidden" : "block"}>
           <div className="bg-gray-900 rounded-xl border border-gray-700 p-8 text-white max-w-4xl mx-auto space-y-6">
             <h2 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-4">
               The Fermi Paradox & The Dark Forest Theory
             </h2>
           </div>
        </div>

        {/* Vista Animación */}
        <div className={`${isTheory ? "hidden" : "flex"} flex-col gap-4 sm:gap-6 w-full`}>
             
             {/* FILA SUPERIOR: Simulación + Controles */}
             <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 w-full min-h-[50vh] lg:min-h-[65vh]">
                 
                 {/* SolarSystem */}
                 <div className="flex-1 w-full rounded-xl overflow-hidden border border-white/20 bg-white/5 relative min-h-[40vh] lg:min-h-0">
                   <SolarSystemMemo />
                 </div>

                 {/* PPOControls */}
                 <div className="w-full lg:w-80 xl:w-96 shrink-0">
                   <PPOControls />
                 </div>
             </div>

             {/* FILA INFERIOR: Gráficas de Métricas */}
             <div className="w-full">
               <GraphicsMemo />
             </div>
             
        </div>
      </main>
    </>
  );
}