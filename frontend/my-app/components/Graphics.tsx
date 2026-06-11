"use client";

export default function GraficasContainer() {
  return (
    <div className="w-full flex flex-col text-white bg-black/20 backdrop-blur-xl border border-white/90 p-4 sm:p-6 lg:p-8 rounded-xl shadow-2xl">
      <h2 className="text-lg sm:text-2xl lg:text-3xl font-light tracking-[0.1em] sm:tracking-[0.2em] mb-6 lg:mb-8 text-center border-b border-white/20 pb-3 lg:pb-4 leading-tight">
        SIMULATION METRICS
      </h2>
      
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
        {/* Dummy Chart 1 */}
        <div className="rounded-lg p-3 sm:p-4 lg:p-6 flex flex-col justify-center items-center border border-white/20 bg-white/5">
          <span className="text-[10px] sm:text-xs lg:text-sm font-light tracking-wider text-gray-300 mb-4 sm:mb-6">
            REWARD OVER TIME
          </span>
          <div className="w-full h-28 sm:h-32 lg:h-40 flex items-end justify-between px-1 sm:px-2 gap-1 sm:gap-2">
            {[30, 45, 25, 60, 40, 70, 65, 80, 90, 85].map((height, i) => (
              <div 
                key={i} 
                className="w-full bg-white/80 rounded-t-sm transition-all hover:bg-white" 
                style={{ height: `${height}%` }}
              ></div>
            ))}
          </div>
        </div>

        {/* Dummy Chart 2 */}
        <div className="rounded-lg p-3 sm:p-4 lg:p-6 flex flex-col justify-center items-center border border-white/20 bg-white/5">
          <span className="text-[10px] sm:text-xs lg:text-sm font-light tracking-wider text-gray-300 mb-4 sm:mb-6">
            EPISODE LENGTH
          </span>
          <div className="w-full h-28 sm:h-32 lg:h-40 flex items-end justify-between px-1 sm:px-2 gap-1 sm:gap-2">
            {[80, 75, 85, 60, 50, 40, 45, 30, 25, 20].map((height, i) => (
              <div 
                key={i} 
                className="w-full bg-white/50 rounded-t-sm transition-all hover:bg-white/80" 
                style={{ height: `${height}%` }}
              ></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}