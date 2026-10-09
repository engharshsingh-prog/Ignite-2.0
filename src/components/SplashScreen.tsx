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
          className="fixed inset-0 z-[70] bg-[#111411] flex items-center justify-center"
        >
          <div className="relative text-center px-6">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="text-6xl sm:text-7xl font-black tracking-tight"
            >
              <span className="text-white">Ignite</span>
              <span className="bg-gradient-to-r from-olive-300 to-blue-300 bg-clip-text text-transparent">2.O</span>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="text-blue-200/90 mt-3 text-sm tracking-[0.25em] uppercase"
            >
              Loading Experience
            </motion.p>

            <div className="mt-8 w-56 max-w-full mx-auto h-1 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                className="h-full w-28 bg-gradient-to-r from-blue-500 via-olive-400 to-blue-500"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
