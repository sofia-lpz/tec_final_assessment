import Link from "next/link";

export default function Header() {
  return (
    <header className="top-0 left-0 right-0 z-50 flex h-16 items-center justify-between bg-black/50 px-6 backdrop-blur-md border-b border-white/10">
      <div className="flex items-center gap-2">
        <Link href="/" className="text-xl font-bold tracking-widest text-white hover:text-blue-400 transition-colors">
          SOLAR SYSTEM
        </Link>
      </div>
      
      <nav className="flex items-center gap-6 text-sm font-medium text-gray-300">
        <Link href="/" className="hover:text-white transition-colors">
          Home
        </Link>
        <Link href="/planets" className="hover:text-white transition-colors">
          Planets
        </Link>
        <Link href="/civilizations" className="hover:text-white transition-colors">
          Civilizations
        </Link>
      </nav>

      <div className="flex items-center gap-4">
        <button className="px-4 py-2 text-sm font-semibold text-black bg-white rounded-md hover:bg-gray-200 transition-colors">
          Connect
        </button>
      </div>
    </header>
  );
}
