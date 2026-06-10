"use client";
import { useState } from "react";
import React from "react";
import SolarSystem from "@/components/SolarSystem";
import PPOControls from "@/components/PPOcontrols";
import GraficasContainer from "@/components/Graphics";
import Header from "@/components/Header";
import ToggleSwitch from "@/components/Switch";

// Optimizamos renderizado
const SolarSystemMemo = React.memo(SolarSystem);
const GraphicsMemo = React.memo(GraficasContainer);

export default function Home() {
  const [isTheory, setIsTheory] = useState(false);

  return (
    <>
      <Header>
        <ToggleSwitch isOn={isTheory} onToggle={() => setIsTheory(!isTheory)} />
      </Header>

      <main className="pt-28 p-6 mx-auto w-[95%] min-h-screen">
        
        {/* Vista Teoría */}
        <div className={!isTheory ? "hidden" : "block"}>
           <div className="bg-gray-900 rounded-xl border border-gray-700 p-8 text-white">
             <h2 className="text-4xl font-bold mb-6">What is the Dark Forest?</h2>
             <p>Contenido de la teoría...</p>
           </div>
        </div>

        {/* Vista Animación: Grid de 10 columnas */}
        <div className={`${isTheory ? "hidden" : "grid"} grid-cols-1 lg:grid-cols-10 gap-6`}>
             
             {/* SolarSystem: Ocupa 8 de 10 columnas (80%) */}
             <div className="lg:col-span-8 h-[700px]">
               <SolarSystemMemo />
             </div>

             {/* PPOControls: Ocupa 2 de 10 columnas (20%) */}
             <div className="lg:col-span-2 h-[700px]">
               <PPOControls />
             </div>

             {/* Graficas: Ocupa las 10 columnas completas (debajo) */}
             <div className="lg:col-span-10 min-h-[300px]">
               <GraphicsMemo />
             </div>
             
        </div>
      </main>
    </>
  );
}