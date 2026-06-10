// app/page.tsx
import SolarSystem from "@/components/SolarSystem";
import PPOControls from "@/components/PPOcontrols";
import GraficasContainer from "@/components/Graphics";

export default function Home() {
  return (
    <main className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      <div className="lg:col-span-2 h-[500px] w-full bg-gray-900 rounded-xl overflow-hidden shadow-lg border border-gray-700">
        <SolarSystem />
      </div>

      {/* Recuadro lateral para tus sliders de PPO */}
      <div className="lg:col-span-1 h-[500px] bg-gray-800 rounded-xl p-4">
        <PPOControls />
      </div>

      {/* Recuadro inferior para tus gráficas */}simulacion/PPOControls
      <div className="lg:col-span-3 min-h-[300px] bg-gray-800 rounded-xl p-4">
        <GraficasContainer />
      </div>
      
    </main>
  );
}