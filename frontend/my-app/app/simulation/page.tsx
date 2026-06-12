"use client";

import React from "react";
import PPOControls from "@/components/PPOcontrols";
import GraficasContainer from "@/components/Graphics";
import Header from "@/components/Header";
import Galaxy from "@/components/Galaxy";
import Footer from "@/components/Footer";

// Optimizamos renderizado
const SolarSystemMemo = React.memo(Galaxy);
const GraphicsMemo = React.memo(GraficasContainer);

export default function SimulationPage() {
  return (
    <>
      <Header />

      <main className="pt-20 md:pt-28 lg:pt-32 px-4 sm:px-6 lg:px-8 w-full min-h-screen">
        
        <div className="flex flex-col gap-4 sm:gap-6 w-full">
             
             {/* FILA SUPERIOR: Simulación + Controles */}
             {/* CAMBIO CLAVE: lg:min-h-[65vh] fue reemplazado por lg:h-[70vh] */}
             <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 w-full min-h-[50vh] lg:h-[70vh]">
                 
                 {/* Galaxy */}
                 <div className="flex-1 w-full rounded-xl overflow-hidden border border-white/20 bg-white/5 relative min-h-[40vh] lg:min-h-0">
                   <SolarSystemMemo />
                 </div>

                 {/* PPOControls */}
                 {/* El h-full ahora obedecerá el límite estricto de 70vh del padre */}
                 <div className="w-full lg:w-80 xl:w-96 shrink-0 h-full max-h-full">
                   <PPOControls />
                 </div>
             </div>

             {/* FILA INFERIOR: Gráficas de Métricas */}
             <div className="w-full">
               <GraphicsMemo />
             </div>
             
        </div>
      </main>
      <Footer />
    </>
  );
}