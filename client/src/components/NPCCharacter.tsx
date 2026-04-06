import { motion } from "framer-motion";

interface NPCCharacterProps {
  isSpeaking?: boolean;
  isTyping?: boolean;
  expression?: "neutral" | "happy" | "teasing" | "listening";
}

export function NPCCharacter({ 
  isSpeaking = false, 
  isTyping = false, 
  expression = "neutral" 
}: NPCCharacterProps) {
  // Animation when speaking/typing
  const speakingAnimation = isSpeaking || isTyping
    ? {
        y: [0, -4, 0],
        rotate: [-1, 1, -1],
        transition: {
          duration: 0.6,
          repeat: Infinity,
          ease: "easeInOut",
        },
      }
    : {};

  // Head tilt animation
  const headAnimation = {
    rotate: [-2, 2, -2],
    transition: {
      duration: 4,
      repeat: Infinity,
      ease: "easeInOut",
    },
  };

  // Eyes blink
  const eyeAnimation = {
    scaleY: [1, 1, 0.1, 1],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: "easeInOut",
      times: [0, 0.8, 0.85, 1],
    },
  };

  // Hair sway
  const hairAnimation = {
    rotateZ: [-1, 1, -1],
    transition: {
      duration: 3.5,
      repeat: Infinity,
      ease: "easeInOut",
    },
  };

  // Mouth expressions - use strokeDasharray for animation
  const mouthPath = expression === "happy" 
    ? "M 45 65 Q 50 72 55 65" 
    : expression === "teasing" 
    ? "M 48 68 Q 50 64 52 68"
    : "M 50 65 Q 50 70 50 70";

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {/* NPC Character SVG */}
      <motion.svg
        viewBox="0 0 200 300"
        className="w-28 h-40 drop-shadow-lg"
        animate={speakingAnimation}
      >
        {/* Body - checkered top like in reference */}
        <motion.g>
          {/* Checkered tank top */}
          <rect x="60" y="90" width="80" height="50" fill="#f5a5c1" rx="8" />
          {/* Checkered pattern */}
          <rect x="70" y="100" width="10" height="10" fill="#ffffff" opacity="0.6" />
          <rect x="85" y="100" width="10" height="10" fill="#ffffff" opacity="0.6" />
          <rect x="100" y="100" width="10" height="10" fill="#ffffff" opacity="0.6" />
          <rect x="115" y="100" width="10" height="10" fill="#ffffff" opacity="0.6" />
          
          <rect x="77.5" y="115" width="10" height="10" fill="#ffffff" opacity="0.6" />
          <rect x="92.5" y="115" width="10" height="10" fill="#ffffff" opacity="0.6" />
          <rect x="107.5" y="115" width="10" height="10" fill="#ffffff" opacity="0.6" />

          {/* Shorts - denim blue */}
          <rect x="65" y="140" width="70" height="35" fill="#4a5f9f" rx="6" />
          
          {/* Legs */}
          <rect x="75" y="175" width="12" height="50" fill="#fdbcb4" />
          <rect x="113" y="175" width="12" height="50" fill="#fdbcb4" />
          
          {/* Shoes - white socks and sneakers */}
          <rect x="72" y="220" width="18" height="8" fill="#ffffff" />
          <rect x="110" y="220" width="18" height="8" fill="#ffffff" />
          <ellipse cx="81" cy="230" rx="10" ry="6" fill="#e8e8e8" />
          <ellipse cx="119" cy="230" rx="10" ry="6" fill="#e8e8e8" />
        </motion.g>

        {/* Head with motion */}
        <motion.g animate={headAnimation}>
          {/* Neck */}
          <rect x="90" y="70" width="20" height="15" fill="#fdbcb4" />
          
          {/* Head shape */}
          <circle cx="100" cy="55" r="28" fill="#fdbcb4" />
          
          {/* Hair - white/blonde with motion */}
          <motion.g animate={hairAnimation}>
            {/* Long hair back */}
            <path
              d="M 72 50 Q 65 80 70 110 Q 75 120 85 118 Q 90 115 95 120 Q 100 125 105 120 Q 110 115 115 118 Q 125 120 130 110 Q 135 80 128 50 Q 100 35 72 50"
              fill="#d4d4e6"
            />
            {/* Hair highlight */}
            <path d="M 85 45 Q 88 70 87 95" stroke="#ffffff" strokeWidth="2" opacity="0.5" fill="none" />
          </motion.g>

          {/* Eyes */}
          <motion.circle cx="88" cy="48" r="4" fill="#2d2d2d" animate={eyeAnimation} />
          <motion.circle cx="112" cy="48" r="4" fill="#2d2d2d" animate={eyeAnimation} />
          
          {/* Eye shine */}
          <circle cx="88.5" cy="47" r="1.5" fill="#ffffff" />
          <circle cx="112.5" cy="47" r="1.5" fill="#ffffff" />
          
          {/* Eyebrows */}
          <path
            d="M 83 42 Q 88 40 93 42"
            stroke="#d4d4e6"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M 107 42 Q 112 40 117 42"
            stroke="#d4d4e6"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          
          {/* Nose */}
          <path d="M 100 50 L 100 60" stroke="#e8c0a8" strokeWidth="1.5" opacity="0.6" />
          
          {/* Mouth - expression based */}
          <path
            d={mouthPath}
            strokeLinecap="round"
            stroke="#ff6b9d"
            strokeWidth="2"
            fill="none"
          />
          
          {/* Blush */}
          <circle cx="72" cy="58" r="6" fill="#ff9db8" opacity="0.3" />
          <circle cx="128" cy="58" r="6" fill="#ff9db8" opacity="0.3" />
        </motion.g>

        {/* Ear */}
        <ellipse cx="135" cy="55" rx="5" ry="10" fill="#fdbcb4" />
      </motion.svg>

      {/* Status indicator */}
      <div className="flex items-center gap-2 text-xs text-white/60">
        {isTyping && (
          <motion.div
            className="flex gap-1"
            animate={{ opacity: [0.5, 1] }}
            transition={{ duration: 0.6, repeat: Infinity }}
          >
            <span className="w-1.5 h-1.5 bg-pink-400 rounded-full" />
            <span className="w-1.5 h-1.5 bg-pink-400 rounded-full" />
            <span className="w-1.5 h-1.5 bg-pink-400 rounded-full" />
          </motion.div>
        )}
        {isSpeaking && !isTyping && (
          <span className="text-pink-400 text-xs">Mluví...</span>
        )}
      </div>
    </div>
  );
}
