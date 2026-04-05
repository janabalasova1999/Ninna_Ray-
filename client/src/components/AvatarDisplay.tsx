import { motion } from "framer-motion";
import ninnaAvatar from "@assets/C1F020F6-C085-42AA-A969-F7D764BAAB70_A8B9D227-12C0-4156-ACDA-_1775416011149.jpeg";

interface AvatarDisplayProps {
  userId?: number;
  compact?: boolean;
}

export function AvatarDisplay({ compact = false }: AvatarDisplayProps) {
  // Gentle floating animation
  const floatingAnimation = {
    y: [0, -15, 0],
    transition: {
      duration: 4,
      repeat: Infinity,
      ease: "easeInOut",
    },
  };

  // Breathing/pulsing animation (opacity)
  const breathingAnimation = {
    opacity: [0.85, 1, 0.85],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: "easeInOut",
    },
  };

  // Slight rotation animation
  const rotationAnimation = {
    rotateZ: [-2, 2, -2],
    transition: {
      duration: 6,
      repeat: Infinity,
      ease: "easeInOut",
    },
  };

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-20 h-24 mx-auto"
      >
        <motion.img 
          src={ninnaAvatar} 
          alt="Ninna" 
          className="w-full h-full object-contain"
          animate={floatingAnimation}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-3 py-6"
    >
      <motion.div 
        className="w-40 h-56 bg-gradient-to-b from-purple-900/20 to-black/40 rounded-2xl p-4 border border-white/10 flex items-center justify-center overflow-hidden shadow-lg shadow-purple-500/20"
        animate={breathingAnimation}
      >
        <motion.div
          animate={floatingAnimation}
          className="w-full h-full flex items-center justify-center"
        >
          <motion.img 
            src={ninnaAvatar} 
            alt="Ninna Ray" 
            className="w-full h-full object-contain"
            animate={rotationAnimation}
            whileHover={{
              scale: 1.05,
              rotateZ: 0,
              transition: { duration: 0.3 },
            }}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
