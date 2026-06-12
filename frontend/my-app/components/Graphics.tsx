"use client";

import { useEffect, useState } from "react";
import { 
  ComposedChart, LineChart, Line, Area, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from "recharts";
import dataProvider from "@/utils/dataProvider"; 

type MetricData = {
  iteration: number;
  broadcast: number;
  survivors: number;
  policyLoss: number;
  valueLoss: number;
};

export default function GraficasContainer() {
  const [metrics, setMetrics] = useState<MetricData[]>([]);

  useEffect(() => {
    console.log("Componente de Gráficas montado y escuchando WebSocket...");

    const unsubscribe = dataProvider.onSimulationMessage((payload: any) => {
      // RADAR: Esto imprimirá TODO lo que llegue por el socket
      if (payload && payload.type) {
        console.log(`[WS] Mensaje entrante: ${payload.type}`);
      }

      if (payload && payload.type === "iteration") {
        console.log("¡Iteración recibida!", payload.stats);
        
        setMetrics((prev) => {
          const newPoint: MetricData = {
            iteration: payload.iteration,
            broadcast: payload.stats.broadcast_rate || 0,
            survivors: payload.stats.mean_survivors || 0,
            policyLoss: payload.stats.policy_loss || 0,
            valueLoss: payload.stats.value_loss || 0,
          };
          return [...prev, newPoint].slice(-100);
        });
      }
    });

    return () => {
      console.log("Componente de Gráficas desmontado.");
      unsubscribe();
    };
  }, []);

  console.log("Renderizando gráficas. Datos actuales:", metrics);

  return (
    <div className="w-full flex flex-col text-white bg-black/20 backdrop-blur-xl border border-white/90 p-4 sm:p-6 lg:p-8 rounded-xl shadow-2xl">
      <h2 className="text-lg sm:text-2xl lg:text-3xl font-light tracking-[0.1em] sm:tracking-[0.2em] mb-6 lg:mb-8 text-center border-b border-white/20 pb-3 lg:pb-4 leading-tight">
        SIMULATION METRICS
      </h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
        
        {/* Gráfica 1 */}
        <div className="rounded-lg p-3 sm:p-4 lg:p-6 flex flex-col border border-white/20 bg-white/5">
          <span className="text-[10px] sm:text-xs lg:text-sm font-light tracking-wider text-gray-300 mb-4 text-center">
            TRAINING: BROADCAST RATE & SURVIVORS
          </span>
          
          {/* Contenedor BLINDADO con CSS en línea para evitar el error amarillo */}
          <div style={{ width: "100%", height: "280px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={metrics} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorBroadcast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.6}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" vertical={false} />
                <XAxis dataKey="iteration" stroke="#ffffff50" fontSize={10} tickLine={false} />
                <YAxis yAxisId="left" stroke="#3b82f6" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="#ec4899" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "#000000e6", borderColor: "#ffffff20", fontSize: "12px", borderRadius: "8px" }} itemStyle={{ color: "#ffffff" }} />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                
                <Area 
                  yAxisId="left" type="monotone" name="Broadcast Rate" dataKey="broadcast" 
                  stroke="#3b82f6" fill="url(#colorBroadcast)" strokeWidth={2} isAnimationActive={false} 
                  dot={{ r: 3, fill: "#3b82f6", stroke: "none" }} 
                />
                <Line 
                  yAxisId="right" type="monotone" name="Survivors" dataKey="survivors" 
                  stroke="#ec4899" strokeWidth={2} strokeDasharray="5 5" isAnimationActive={false} 
                  dot={{ r: 3, fill: "#ec4899", stroke: "none" }} 
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfica 2 */}
        <div className="rounded-lg p-3 sm:p-4 lg:p-6 flex flex-col border border-white/20 bg-white/5">
          <span className="text-[10px] sm:text-xs lg:text-sm font-light tracking-wider text-gray-300 mb-4 text-center">
            TRAINING: MODEL LOSS
          </span>
          
          <div style={{ width: "100%", height: "280px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" vertical={false} />
                <XAxis dataKey="iteration" stroke="#ffffff50" fontSize={10} tickLine={false} />
                <YAxis stroke="#ffffff50" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "#000000e6", borderColor: "#ffffff20", fontSize: "12px", borderRadius: "8px" }} itemStyle={{ color: "#ffffff" }} />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                
                <Line type="monotone" name="Policy Loss" dataKey="policyLoss" stroke="#10b981" strokeWidth={2} isAnimationActive={false} dot={{ r: 3, fill: "#10b981", stroke: "none" }} />
                <Line type="monotone" name="Value Loss" dataKey="valueLoss" stroke="#f59e0b" strokeWidth={2} isAnimationActive={false} dot={{ r: 3, fill: "#f59e0b", stroke: "none" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}