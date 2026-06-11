"use client";

import { useState } from "react";

export default function PPOControls() {
  const [learningRate, setLearningRate] = useState(0.001);
  const [gamma, setGamma] = useState(0.99);

  return (
    <div className="h-full w-full flex flex-col text-white bg-black/20 backdrop-blur-xl border border-white/90 p-4 sm:p-6 lg:p-8 rounded-xl shadow-2xl overflow-hidden">
      <h2 className="text-base sm:text-xl lg:text-2xl font-light tracking-[0.15em] sm:tracking-widest mb-6 lg:mb-8 text-center border-b border-white/20 pb-3 lg:pb-4 leading-tight break-words">
        PPO PARAMETERS
      </h2>
      
      <div className="flex-1 space-y-6 sm:space-y-8 mt-2">
        <div className="space-y-3 lg:space-y-4">
          <label className="flex justify-between text-[10px] sm:text-xs lg:text-sm font-light tracking-wider text-gray-300 gap-2">
            <span className="truncate">LEARNING RATE</span>
            <span className="shrink-0">{learningRate}</span>
          </label>
          <input
            type="range"
            min="0.0001"
            max="0.01"
            step="0.0001"
            value={learningRate}
            onChange={(e) => setLearningRate(parseFloat(e.target.value))}
            className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
          />
        </div>

        <div className="space-y-3 lg:space-y-4">
          <label className="flex justify-between text-[10px] sm:text-xs lg:text-sm font-light tracking-wider text-gray-300 gap-2">
            <span className="truncate">GAMMA</span>
            <span className="shrink-0">{gamma}</span>
          </label>
          <input
            type="range"
            min="0.8"
            max="0.999"
            step="0.001"
            value={gamma}
            onChange={(e) => setGamma(parseFloat(e.target.value))}
            className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
          />
        </div>
      </div>

      <button className="mt-8 lg:mt-auto w-full py-2 lg:py-3 border border-white hover:bg-white hover:text-black text-[10px] sm:text-xs lg:text-sm font-semibold tracking-widest transition-all duration-300">
        APPLY
      </button>
    </div>
  );
}