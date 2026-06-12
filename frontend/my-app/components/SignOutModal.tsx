"use client";

type SignOutModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function SignOutModal({ isOpen, onClose, onConfirm }: SignOutModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      
      {/* Contenedor del Modal */}
      <div className="w-full max-w-sm bg-black/80 border border-white/20 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header de Advertencia */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3 bg-red-900/20">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-white text-sm tracking-[0.2em] font-light">
            CONFIRM SIGN OUT
          </h3>
        </div>
        {/* Cuerpo del mensaje */}
        <div className="p-6 md:p-8">
          <p className="text-gray-200 text-sm md:text-base tracking-wide leading-relaxed drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">
            Are you sure you want to terminate your session? You will be disconnected from the simulation environment and will need to authenticate again.
          </p>
        </div>
        {/* Botones de acción */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/5 flex gap-3 justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 border border-white/20 text-white/70 hover:text-white hover:border-white text-[10px] tracking-widest transition-all"
          >
            CANCEL
          </button>
          <button 
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600/80 hover:bg-red-500 text-white text-[10px] tracking-widest font-bold transition-colors border border-red-500"
          >
            TERMINATE SESSION
          </button>
        </div>

      </div>
    </div>
  );
}