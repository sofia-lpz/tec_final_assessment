// components/Header.tsx
"use client";

export default function Header({ children }: { children: React.ReactNode }) {
  return (
    <header className="fixed top-0 w-full z-50 h-24 px-12 bg-black/50 backdrop-blur-md border-b border-white/10 flex items-center">
      
      <div className="w-1/3"></div>

      <div className="w-1/3 flex justify-center">
        <h1 className="text-white font-black tracking-widest text-5xl">
          DARK FOREST
        </h1>
      </div>

      <div className="w-1/3 flex justify-end">
        {children}
      </div>
      
    </header>
  );
}