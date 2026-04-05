import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import ninnaAvatar from "@assets/C1F020F6-C085-42AA-A969-F7D764BAAB70_A8B9D227-12C0-4156-ACDA-_1775416011149.jpeg";

interface AvatarElement {
  id: number;
  contentItemId: number | null;
  elementType: string;
  name: string;
  previewUrl: string | null;
}

interface WardrobeData {
  unlocked: AvatarElement[];
  locked: AvatarElement[];
  currentConfig: Record<string, any>;
}

interface AvatarDisplayProps {
  userId?: number;
  compact?: boolean;
}

export function AvatarDisplay({ userId, compact = false }: AvatarDisplayProps) {
  // Fetch wardrobe data
  const { data: wardrobeData } = useQuery<WardrobeData>({
    queryKey: ["/api/bot/wardrobe"],
    enabled: !!userId,
    retry: false,
  });

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

  // Render avatar with skin preview
  const renderAvatarContent = () => {
    const config = wardrobeData?.currentConfig || {};
    const unlockedCount = wardrobeData?.unlocked?.length || 0;

    return (
      <>
        {/* Base avatar image */}
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
        
        {/* Overlay showing unlocked items count */}
        {unlockedCount > 0 && (
          <div className="absolute top-2 right-2 bg-pink-600/80 backdrop-blur-sm px-3 py-1 rounded-full text-white text-xs font-bold">
            ✨ {unlockedCount}
          </div>
        )}
      </>
    );
  };

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-20 h-24 mx-auto"
      >
        <motion.div
          animate={floatingAnimation}
          className="w-full h-full"
        >
          <img 
            src={ninnaAvatar} 
            alt="Ninna" 
            className="w-full h-full object-contain"
          />
        </motion.div>
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
        className="w-40 h-56 bg-gradient-to-b from-purple-900/20 to-black/40 rounded-2xl p-4 border border-white/10 flex items-center justify-center overflow-hidden shadow-lg shadow-purple-500/20 relative"
        animate={breathingAnimation}
      >
        <motion.div
          animate={floatingAnimation}
          className="w-full h-full flex items-center justify-center relative"
        >
          {renderAvatarContent()}
        </motion.div>
      </motion.div>

      {/* Show what's unlocked */}
      {wardrobeData?.unlocked && wardrobeData.unlocked.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center text-sm"
        >
          <div className="text-pink-400 font-bold mb-2">
            🎀 Odemčené: {wardrobeData.unlocked.length}
          </div>
          <div className="flex flex-wrap gap-2 justify-center max-w-xs">
            {wardrobeData.unlocked.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="text-xs bg-pink-600/20 border border-pink-500/30 rounded-full px-2.5 py-1 text-pink-300"
              >
                {item.elementType === "outfit" && "👗"}
                {item.elementType === "hair" && "💇"}
                {item.elementType === "accessory" && "✨"}
                {item.elementType === "expression" && "😊"}
                {item.elementType === "background" && "🎨"}
              </div>
            ))}
            {wardrobeData.unlocked.length > 3 && (
              <div className="text-xs text-neutral-500">
                +{wardrobeData.unlocked.length - 3} dalších
              </div>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
