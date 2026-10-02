import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface HeartItem {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
}

export default function PinkAestheticBg() {
  const [fountainHearts, setFountainHearts] = useState<HeartItem[]>([]);
  const [ambientHearts, setAmbientHearts] = useState<HeartItem[]>([]);

  useEffect(() => {
    // Generate Ambient background hearts
    const ambient: HeartItem[] = Array.from({ length: 12 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100, // percentage width
      y: Math.random() * 100, // percentage height
      size: Math.random() * 24 + 10,
      delay: Math.random() * 5,
      duration: Math.random() * 15 + 15,
    }));
    setAmbientHearts(ambient);

    // Launch a soft burst of hearts on initial entry/mount
    const burst: HeartItem[] = Array.from({ length: 25 }).map((_, i) => ({
      id: Date.now() + i,
      x: 20 + Math.random() * 60, // center-ish horizontally
      y: 100, // starts from bottom
      size: Math.random() * 25 + 12,
      delay: Math.random() * 0.8,
      duration: Math.random() * 2.5 + 2,
    }));
    setFountainHearts(burst);

    // Clean up fountain hearts after they animate away
    const timer = setTimeout(() => {
      setFountainHearts([]);
    }, 4500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Soft overlay gradient grid */}
      <div 
        className="absolute inset-0 opacity-[0.03]" 
        style={{
          backgroundImage: `radial-gradient(circle, var(--accent) 1px, transparent 1px)`,
          backgroundSize: "24px 24px"
        }}
      />
      
      {/* Glowing background radial spots */}
      <div 
        className="absolute w-[600px] h-[600px] rounded-full filter blur-[150px] opacity-15"
        style={{
          background: "radial-gradient(circle, #ff40ca 0%, transparent 70%)",
          top: "-10%",
          right: "-10%",
        }}
      />
      <div 
        className="absolute w-[500px] h-[500px] rounded-full filter blur-[120px] opacity-10"
        style={{
          background: "radial-gradient(circle, #ff9beb 0%, transparent 70%)",
          bottom: "10%",
          left: "-5%",
        }}
      />

      {/* Ambient slowly floating hearts */}
      {ambientHearts.map((heart) => (
        <motion.svg
          key={heart.id}
          viewBox="0 0 24 24"
          fill="currentColor"
          className="absolute text-[#ff40ca]/15 drop-shadow-[0_0_8px_rgba(255,102,216,0.3)]"
          style={{
            left: `${heart.x}%`,
            top: `${heart.y}%`,
            width: heart.size,
            height: heart.size,
          }}
          animate={{
            y: [0, -40, 0],
            x: [0, 15, 0],
            rotate: [0, 45, 0],
            opacity: [0.15, 0.4, 0.15],
          }}
          transition={{
            duration: heart.duration,
            repeat: Infinity,
            delay: heart.delay,
            ease: "easeInOut",
          }}
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </motion.svg>
      ))}

      {/* Entry burst fountain hearts */}
      <AnimatePresence>
        {fountainHearts.map((heart) => (
          <motion.svg
            key={heart.id}
            viewBox="0 0 24 24"
            fill="currentColor"
            className="absolute text-[var(--accent)] drop-shadow-[0_0_15px_rgba(255,102,216,0.8)]"
            style={{
              left: `${heart.x}%`,
              width: heart.size,
              height: heart.size,
            }}
            initial={{ y: "105vh", opacity: 0, scale: 0.5, rotate: -20 }}
            animate={{ 
              y: "-15vh", 
              opacity: [0, 0.9, 0.9, 0], 
              scale: [0.5, 1.2, 1, 0.6],
              rotate: [-20, 20, -10, 45]
            }}
            transition={{
              duration: heart.duration,
              delay: heart.delay,
              ease: "easeOut",
            }}
          >
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </motion.svg>
        ))}
      </AnimatePresence>
    </div>
  );
}
