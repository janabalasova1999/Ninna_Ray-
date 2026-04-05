import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

interface VisualConfig {
  outfit?: string;
  hair?: string;
  expression?: string;
  background?: string;
  accessory?: string;
}

interface AvatarDisplayProps {
  userId?: number;
  compact?: boolean;
}

export function AvatarDisplay({ userId, compact = false }: AvatarDisplayProps) {
  const { data: wardrobeData } = useQuery({
    queryKey: ["/api/bot/wardrobe"],
    enabled: !!userId,
    retry: false,
  });

  const config = wardrobeData?.currentConfig as VisualConfig | undefined;

  // Simple SVG avatar with dynamic colors based on outfit
  const renderAvatar = () => {
    const outfitColor = config?.outfit === "1774332451293-12tie010heca" ? "#ec4899" : "#a855f7";
    const hairColor = config?.hair?.includes("blond") ? "#fbbf24" : "#000";
    const bgColor = config?.background?.includes("pink") ? "#be185d" : "#5b21b6";

    return (
      <svg
        viewBox="0 0 200 300"
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background */}
        <rect width="200" height="300" fill={bgColor} opacity="0.3" rx="20" />

        {/* Head */}
        <circle cx="100" cy="80" r="40" fill="#f4d4b9" />

        {/* Hair */}
        <path
          d="M 60 80 Q 60 40 100 35 Q 140 40 140 80"
          fill={hairColor}
        />

        {/* Eyes */}
        <circle cx="85" cy="70" r="5" fill="#000" />
        <circle cx="115" cy="70" r="5" fill="#000" />

        {/* Expression (smile) */}
        {config?.expression === "happy" ? (
          <path
            d="M 85 85 Q 100 95 115 85"
            stroke="#000"
            strokeWidth="2"
            fill="none"
          />
        ) : (
          <path
            d="M 85 85 L 115 85"
            stroke="#000"
            strokeWidth="2"
            fill="none"
          />
        )}

        {/* Body/Outfit */}
        <path
          d="M 75 120 L 75 200 L 125 200 L 125 120 Q 100 110 75 120"
          fill={outfitColor}
          opacity="0.8"
        />

        {/* Arms */}
        <rect x="50" y="140" width="25" height="70" rx="12" fill="#f4d4b9" />
        <rect x="125" y="140" width="25" height="70" rx="12" fill="#f4d4b9" />

        {/* Accessory indicator */}
        {config?.accessory && (
          <circle cx="100" cy="110" r="8" fill="#fbbf24" opacity="0.7" />
        )}
      </svg>
    );
  };

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-20 h-24 mx-auto"
      >
        {renderAvatar()}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-3 py-6"
    >
      <div className="w-32 h-40 bg-gradient-to-b from-purple-900/20 to-black/40 rounded-2xl p-4 border border-white/10">
        {renderAvatar()}
      </div>

      {config && (
        <div className="text-center text-xs text-neutral-400 space-y-1">
          {config.outfit && (
            <div className="flex items-center justify-center gap-1">
              <span className="text-[8px]">👕</span>
              <span className="truncate max-w-20">
                {config.outfit.split("-").pop()?.slice(0, 10)}
              </span>
            </div>
          )}
          {config.hair && (
            <div className="flex items-center justify-center gap-1">
              <span className="text-[8px]">💇</span>
              <span className="truncate max-w-20">
                {config.hair.split("-").pop()?.slice(0, 10)}
              </span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
