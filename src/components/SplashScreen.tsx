import { AnimatePresence, motion } from 'framer-motion';

interface SplashScreenProps {
  show: boolean;
}

export default function SplashScreen({ show }: SplashScreenProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6, ease: 'easeInOut' } }}
          className="fixed inset-0 z-[70] bg-[#040814]/95 backdrop-blur-2xl flex items-center justify-center overflow-hidden"
        >
          {/* Ambient splash orbs */}
          <div className="absolute w-96 h-96 rounded-full bg-cyan-500/20 blur-3xl -translate-x-20 -translate-y-10 pointer-events-none" />
          <div className="absolute w-96 h-96 rounded-full bg-violet-500/20 blur-3xl translate-x-20 translate-y-10 pointer-events-none" />

          <div className="relative text-center px-8 py-10 rounded-3xl liquid-glass border-cyan-300/25 shadow-2xl">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="text-6xl sm:text-7xl font-black tracking-tight"
            >
              <span className="text-white">Ignite</span>
              <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-300 bg-clip-text text-transparent">2.O</span>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="text-cyan-200/90 mt-3 text-sm tracking-[0.28em] uppercase font-semibold"
            >
              Liquid Glass Experience
            </motion.p>

            <div className="mt-8 w-56 max-w-full mx-auto h-1.5 rounded-full bg-white/10 overflow-hidden border border-white/15">
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                className="h-full w-28 bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 rounded-full"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
