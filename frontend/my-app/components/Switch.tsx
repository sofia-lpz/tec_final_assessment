'use client';
import { motion } from 'framer-motion';

export default function ToggleSwitch({ isOn, onToggle }: { isOn: boolean; onToggle: () => void }) {
  return (
    <div 
      className="relative w-80 h-12 rounded-full p-1 cursor-pointer flex items-center border border-white/30"
      onClick={onToggle}
    >
      {/* Círculo animado que cubre el texto */}
      <motion.div 
        layout
        className="absolute top-1 bottom-1 w-[48%] bg-white rounded-full shadow-lg"
        animate={{ x: isOn ? '106%' : '0%' }} // Se mueve al 106% del ancho para cubrir el lado derecho
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      />

      {/* Textos - Posicionados mediante Flexbox */}
      <div className="relative w-full flex text-sm font-bold">
        <span className={`w-1/2 text-center transition-colors duration-900 ${!isOn ? 'text-black' : 'text-gray-100'}`}>
          SIMULATION
        </span>
        <span className={`w-1/2 text-center transition-colors duration-900 ${isOn ? 'text-black' : 'text-gray-100'}`}>
          THEORY
        </span>
      </div>
    </div>
  );
}