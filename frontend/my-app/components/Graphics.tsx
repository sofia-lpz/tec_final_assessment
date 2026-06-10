"use client";

export default function GraficasContainer() {
  return (
    <div className="flex flex-col h-full text-white">
      <h2 className="text-xl font-bold mb-4">Simulation Metrics</h2>
      
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Dummy Chart 1 */}
        <div className="bg-gray-900 rounded-lg p-4 flex flex-col justify-center items-center border border-gray-700">
          <span className="text-gray-400 mb-2">Reward over Time</span>
          <div className="w-full h-32 flex items-end justify-between px-2 gap-1">
            {[30, 45, 25, 60, 40, 70, 65, 80, 90, 85].map((height, i) => (
              <div 
                key={i} 
                className="w-full bg-blue-500 rounded-t-sm" 
                style={{ height: `${height}%` }}
              ></div>
            ))}
          </div>
        </div>

        {/* Dummy Chart 2 */}
        <div className="bg-gray-900 rounded-lg p-4 flex flex-col justify-center items-center border border-gray-700">
          <span className="text-gray-400 mb-2">Episode Length</span>
          <div className="w-full h-32 flex items-end justify-between px-2 gap-1">
            {[80, 75, 85, 60, 50, 40, 45, 30, 25, 20].map((height, i) => (
              <div 
                key={i} 
                className="w-full bg-green-500 rounded-t-sm" 
                style={{ height: `${height}%` }}
              ></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
