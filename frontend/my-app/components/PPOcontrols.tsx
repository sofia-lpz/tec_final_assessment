"use client";

import { useState } from "react";

export default function PPOControls() {
  const [learningRate, setLearningRate] = useState(0.001);
  const [gamma, setGamma] = useState(0.99);

  return (
    <div className="h-full flex flex-col text-white bg-black/20 backdrop-blur-xl border border-white/90 p-8 rounded-xl shadow-2xl">
      <h2 className="text-3xl font-light tracking-[0.2em] mb-8 text-center border-b border-white/20 pb-4">
        PPO PARAMETERS
      </h2>
      
      <div className="flex-1 space-y-10 mt-4">
        <div className="space-y-4">
          <label className="flex justify-between text-xs font-light tracking-wider text-gray-300">
            <span>LEARNING RATE</span>
            <span>{learningRate}</span>
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

        <div className="space-y-4">
          <label className="flex justify-between text-xs font-light tracking-wider text-gray-300">
            <span>GAMMA</span>
            <span>{gamma}</span>
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

      <button className="mt-8 w-full py-3 border border-white hover:bg-white hover:text-black text-white text-xs font-semibold tracking-widest transition-all duration-300">
        APPLY
      </button>
    </div>
  );
}

