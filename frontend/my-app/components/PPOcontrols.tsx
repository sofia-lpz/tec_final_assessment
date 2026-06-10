"use client";

import { useState } from "react";

export default function PPOControls() {
  const [learningRate, setLearningRate] = useState(0.001);
  const [gamma, setGamma] = useState(0.99);

  return (
    <div className="flex flex-col h-full text-white">
      <h2 className="text-xl font-bold mb-4">PPO Controls</h2>
      
      <div className="flex-1 space-y-6">
        <div>
          <label className="flex justify-between mb-2 text-sm text-gray-300">
            <span>Learning Rate</span>
            <span>{learningRate}</span>
          </label>
          <input
            type="range"
            min="0.0001"
            max="0.01"
            step="0.0001"
            value={learningRate}
            onChange={(e) => setLearningRate(parseFloat(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>

        <div>
          <label className="flex justify-between mb-2 text-sm text-gray-300">
            <span>Gamma (Discount Factor)</span>
            <span>{gamma}</span>
          </label>
          <input
            type="range"
            min="0.8"
            max="0.999"
            step="0.001"
            value={gamma}
            onChange={(e) => setGamma(parseFloat(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>
      </div>

      <button className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
        Apply Parameters
      </button>
    </div>
  );
}
