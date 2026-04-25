import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, CheckCheck, Lock, Unlock, ExternalLink, Play } from "lucide-react";

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  isTyping?: boolean;
  isSeen?: boolean;
}

function TeaserPreview({ photoId }: { photoId: string }) {
  const [mediaInfo, setMediaInfo] = useState<{ isVideo: boolean; isImage: boolean } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/content/info/${photoId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setMediaInfo(data); })
      .catch(() => {});
  }, [photoId]);

  const isVideo = mediaInfo?.isVideo;

  return (
    <div className="relative mt-2 mb-1 rounded-xl overflow-hidden" data-testid={`teaser-${photoId}`}>
      {isVideo ? (
        <div className="w-full h-48 bg-gradient-to-b from-purple-900/60 to-black/80 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
            <Play className="w-6 h-6 text-white ml-0.5" />
          </div>
          <div className="absolute bottom-3 left-3 text-white/60 text-xs font-medium">
            Privátní video 🔒
          </div>
        </div>
      ) : (
        <>
          <img
            src={`/api/content/teaser/${photoId}`}
            alt="Preview"
            className={cn(
              "w-full max-w-xs object-cover transition-opacity duration-500",
              loaded ? "opacity-100" : "opacity-0"
            )}
            style={{ maxHeight: "200px" }}
            onLoad={() => setLoaded(true)}
            loading="lazy"
            data-testid={`teaser-img-${photoId}`}
          />
          {!loaded && (
            <div className="w-full h-48 bg-gradient-to-b from-purple-900/40 to-black/60 animate-pulse" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/90 to-transparent flex items-end pb-1.5 px-3">
            <span className="text-white/50 text-[10px] font-medium tracking-wide">🔒 Zamčený obsah</span>
          </div>
        </>
      )}
    </div>
  );
}

function PaymentButton({ photoId, price, url }: { photoId: string; price: string; url: string }) {
  return (
    <div>
      <TeaserPreview photoId={photoId} />
      <motion.a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white font-bold text-sm shadow-lg shadow-pink-500/20 transition-all no-underline"
        data-testid={`button-unlock-${photoId}`}
      >
        <Lock className="w-4 h-4 shrink-0" />
        <span className="flex-1">Odemknout za {price} Kč</span>
        <ExternalLink className="w-3.5 h-3.5 shrink-0 opacity-60" />
      </motion.a>
    </div>
  );
}

function UnlockedContent({ photoId }: { photoId: string }) {
  const [mediaInfo, setMediaInfo] = useState<{ isVideo: boolean; isImage: boolean } | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch(`/api/content/info/${photoId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setMediaInfo(data); })
      .catch(() => {});
  }, [photoId]);

  const mediaUrl = `/api/content/unlocked/${photoId}`;

  return (
    <div className="mt-3" data-testid={`unlocked-${photoId}`}>
      <div className="flex items-center gap-2 px-4 py-2 rounded-t-xl bg-emerald-500/10 border border-emerald-500/30 border-b-0 text-emerald-400 text-sm font-bold">
        <Unlock className="w-4 h-4 shrink-0" />
        <span>Obsah odemknut 🔓</span>
      </div>
      {!loadError && mediaInfo?.isVideo ? (
        <video
          src={mediaUrl}
          controls
          playsInline
          className="w-full max-w-sm rounded-b-xl border border-emerald-500/30 border-t-0"
          onError={() => setLoadError(true)}
          data-testid={`video-unlocked-${photoId}`}
        />
      ) : !loadError && (mediaInfo?.isImage || mediaInfo === null) ? (
        <img
          src={mediaUrl}
          alt="Odemknutý obsah"
          className="w-full max-w-sm rounded-b-xl border border-emerald-500/30 border-t-0 object-cover"
          onError={() => setLoadError(true)}
          loading="lazy"
          data-testid={`img-unlocked-${photoId}`}
        />
      ) : (
        <div className="px-4 py-3 rounded-b-xl bg-emerald-500/5 border border-emerald-500/30 border-t-0 text-emerald-400/70 text-xs">
          Obsah je odemknutý.
        </div>
      )}
    </div>
  );
}

function parseContentParts(content: string) {
  const unlockRegex = /\[UNLOCK_CONTENT:(\d+):(\d+):(https?:\/\/[^\]]+)\]/g;
  const unlockedRegex = /\[UNLOCKED_CONTENT:(\d+)\]/g;

  const parts: Array<{ type: "text"; value: string } | { type: "unlock"; photoId: string; price: string; url: string } | { type: "unlocked"; photoId: string }> = [];

  let lastIndex = 0;
  const allMatches: Array<{ index: number; length: number; result: any }> = [];

  let match;
  while ((match = unlockRegex.exec(content)) !== null) {
    allMatches.push({
      index: match.index,
      length: match[0].length,
      result: { type: "unlock" as const, photoId: match[1], price: match[2], url: match[3] },
    });
  }
  while ((match = unlockedRegex.exec(content)) !== null) {
    allMatches.push({
      index: match.index,
      length: match[0].length,
      result: { type: "unlocked" as const, photoId: match[1] },
    });
  }

  allMatches.sort((a, b) => a.index - b.index);

  for (const m of allMatches) {
    if (m.index > lastIndex) {
      const text = content.slice(lastIndex, m.index).trim();
      if (text) parts.push({ type: "text", value: text });
    }
    parts.push(m.result);
    lastIndex = m.index + m.length;
  }

  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text) parts.push({ type: "text", value: text });
  }

  return parts.length > 0 ? parts : [{ type: "text" as const, value: content }];
}

export function ChatBubble({ role, content, isTyping, isSeen }: ChatBubbleProps) {
  const isUser = role === "user";
  const parts = !isTyping && content ? parseContentParts(content) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        "flex flex-col w-full mb-4",
        isUser ? "items-end" : "items-start"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] px-5 py-3 rounded-2xl text-sm md:text-base leading-relaxed shadow-md relative",
          isUser
            ? "bg-gradient-to-br from-primary to-secondary text-white rounded-br-none"
            : "bg-card border border-white/10 text-gray-200 rounded-bl-none shadow-black/20"
        )}
      >
        {isTyping && !content ? (
          <div className="flex gap-1 h-6 items-center px-1">
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" />
          </div>
        ) : (
          <div>
            {parts.map((part, i) => {
              if (part.type === "text") {
                return (
                  <div key={i} className="prose prose-sm dark:prose-invert prose-p:leading-relaxed prose-a:text-pink-500 prose-a:underline hover:prose-a:text-pink-400 break-words">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.value}</ReactMarkdown>
                  </div>
                );
              }
              if (part.type === "unlock") {
                return <PaymentButton key={i} photoId={part.photoId} price={part.price} url={part.url} />;
              }
              if (part.type === "unlocked") {
                return <UnlockedContent key={i} photoId={part.photoId} />;
              }
              return null;
            })}
          </div>
        )}
      </div>
      
      {isUser && (
        <div className="flex items-center gap-1 mt-1 px-1">
          {isSeen ? (
            <>
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-tighter">Seen</span>
              <CheckCheck className="w-3 h-3 text-pink-500" />
            </>
          ) : (
            <>
              <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-tighter">Sent</span>
              <Check className="w-3 h-3 text-neutral-500" />
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}
