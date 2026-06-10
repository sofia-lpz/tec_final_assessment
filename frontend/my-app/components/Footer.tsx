import Link from "next/link";

export default function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-black/50 backdrop-blur-md border-t border-white/10 text-xs text-gray-400">
      <div>
        &copy; {new Date().getFullYear()} Solar System Exploration.
      </div>
      
      <div className="flex gap-4">
        <Link href="/about" className="hover:text-white transition-colors">
          About
        </Link>
        <Link href="/privacy" className="hover:text-white transition-colors">
          Privacy Policy
        </Link>
        <Link href="/contact" className="hover:text-white transition-colors">
          Contact
        </Link>
      </div>
    </footer>
  );
}
