"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Center, Environment } from "@react-three/drei";
import Planet from "@/components/Planet";

function PlanetPreviewCanvas({ state }: { state: "transmitting" | "scienceplus" }) {
  return (
    <div className="h-28 w-28 sm:h-32 sm:w-32 shrink-0 rounded-lg overflow-hidden border border-white/20 bg-black">
      <Canvas camera={{ position: [0, 0, 8], fov: 45, near: 0.1, far: 200 }}>
        <Environment preset="night" />
        <ambientLight intensity={0.35} />
        <Suspense fallback={null}>
          <Center>
            <Planet name="neptune" scale={1} rotationSpeed={0} state={state} ready />
          </Center>
        </Suspense>
      </Canvas>
    </div>
  );
}

export function TransmitPlanetPreview() {
  return <PlanetPreviewCanvas state="transmitting" />;
}

export function SciencePlanetPreview() {
  return <PlanetPreviewCanvas state="scienceplus" />;
}

export default function PlanetStatesSection() {
  return (
    <div className="w-full flex flex-col text-white bg-black/20 backdrop-blur-xl border border-white/90 p-4 sm:p-6 lg:p-8 rounded-xl shadow-2xl">
      <h2 className="text-lg sm:text-2xl lg:text-3xl font-light tracking-[0.1em] sm:tracking-[0.2em] mb-6 lg:mb-8 text-center border-b border-white/20 pb-3 lg:pb-4 leading-tight">
        PLANET STATES
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
        <div className="rounded-lg p-3 sm:p-4 lg:p-6 flex flex-col sm:flex-row items-center gap-4 border border-white/20 bg-white/5">
          <TransmitPlanetPreview />
          <div>
            <h3 className="text-xs sm:text-sm font-light tracking-wider text-gray-300 mb-2">
              TRANSMIT
            </h3>
            <p className="text-[10px] sm:text-xs tracking-wider text-gray-400 leading-relaxed">
              When a civilization broadcasts, all of its owned planets pulse with green rings,
              revealing its presence to the galaxy.
            </p>
          </div>
        </div>

        <div className="rounded-lg p-3 sm:p-4 lg:p-6 flex flex-col sm:flex-row items-center gap-4 border border-white/20 bg-white/5">
          <SciencePlanetPreview />
          <div>
            <h3 className="text-xs sm:text-sm font-light tracking-wider text-gray-300 mb-2">
              SCIENCE
            </h3>
            <p className="text-[10px] sm:text-xs tracking-wider text-gray-400 leading-relaxed">
              When a civilization explores, its owned planets show orbiting beakers, expanding
              explored territory and gaining science.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}