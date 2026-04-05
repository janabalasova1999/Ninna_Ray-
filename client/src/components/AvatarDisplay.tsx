import { motion } from "framer-motion";
import ninnaAvatar from "@assets/C1F020F6-C085-42AA-A969-F7D764BAAB70_A8B9D227-12C0-4156-ACDA-_1775416011149.jpeg";

interface AvatarDisplayProps {
  userId?: number;
  compact?: boolean;
}

export function AvatarDisplay({ compact = false }: AvatarDisplayProps) {
  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-20 h-24 mx-auto"
      >
        <img 
          src={ninnaAvatar} 
          alt="Ninna" 
          className="w-full h-full object-contain"
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
      <div className="w-40 h-56 bg-gradient-to-b from-purple-900/20 to-black/40 rounded-2xl p-4 border border-white/10 flex items-center justify-center overflow-hidden">
        <img 
          src={ninnaAvatar} 
          alt="Ninna Ray" 
          className="w-full h-full object-contain"
        />
      </div>
    </motion.div>
  );
}
