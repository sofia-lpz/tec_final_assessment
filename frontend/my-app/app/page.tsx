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
           <div className="bg-gray-900 rounded-xl border border-gray-700 p-8 text-white max-w-4xl mx-auto space-y-6">
             
             <h2 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-4">
               The Fermi Paradox & The Dark Forest Theory
             </h2>
             
             <section className="space-y-4">
               <h3 className="text-2xl font-semibold text-blue-300">The Fermi Paradox: Where is everybody?</h3>
               <p className="text-gray-300 leading-relaxed">
                 Formulated by physicist Enrico Fermi, this paradox highlights the profound contradiction 
                 between the high mathematical probability of extraterrestrial civilizations and the absolute 
                 lack of evidence or contact with them. Given that the universe is billions of years old 
                 and contains trillions of stars, even a tiny fraction of planets developing interstellar travel 
                 should have resulted in the colonization of the galaxy by now. Yet, we observe only silence.
               </p>
             </section>

             <hr className="border-gray-800" />

             <section className="space-y-4">
               <h3 className="text-2xl font-semibold text-purple-300">The Dark Forest Theory: A Terrifying Solution</h3>
               <p className="text-gray-300 leading-relaxed">
                 Based on the sci-fi novel by Liu Cixin, this theory provides a chilling resolution to Fermi&apos;s paradox. 
                 It proposes that the universe is like a dark forest, where every civilization acts as an armed hunter 
                 stalking through the trees. In this environment, resources are limited, and exponential growth makes 
                 any other civilization a potential threat. 
               </p>
               <p className="text-gray-300 leading-relaxed">
                 Because of the cosmic distance, true trust is impossible to establish (the Chain of Suspicion). 
                 Therefore, the most rational survival strategy for any advanced civilization is to remain absolutely 
                 silent, and to immediately eliminate any other civilization that reveals its location before they become 
                 a threat.
               </p>
             </section>

             <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 mt-6">
               <h4 className="text-md font-semibold text-yellow-400 mb-2">Core Axioms of Cosmic Sociology:</h4>
               <ul className="list-disc pl-5 space-y-1 text-sm text-gray-400">
                 <li>Survival is the primary need of any civilization.</li>
                 <li>Civilizations continuously expand and grow, but the total matter in the universe remains constant.</li>
                 <li>The Chain of Suspicion: Distance breeds mistrust; it is impossible to know if another species is benevolent or malevolent.</li>
               </ul>
             </div>

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