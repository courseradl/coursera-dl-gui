import React, { useState } from "react";
import { GraduationCap, Layers } from "lucide-react";

interface CachedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  alt: string;
  fallbackIcon?: "course" | "spec";
  className?: string;
  containerClassName?: string;
}

const imageCache = new Set<string>();

export function CachedImage({
  src,
  alt,
  fallbackIcon = "course",
  className = "w-full h-full object-cover object-center",
  containerClassName = "w-full h-full relative overflow-hidden bg-[#1F1F1F] dark:bg-[#0B0B14]",
  ...props
}: CachedImageProps) {
  const isPreloaded = src ? imageCache.has(src) : false;
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    isPreloaded ? "loaded" : "loading"
  );


  if (!src) {
    return (
      <div className={`${containerClassName} flex items-center justify-center bg-gradient-to-br from-[#0056D2]/80 to-[#271066]`}>
        {fallbackIcon === "spec" ? (
          <Layers className="h-8 w-8 text-white/40" />
        ) : (
          <GraduationCap className="h-8 w-8 text-white/40" />
        )}
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      {status === "loading" && (
        <div className="absolute inset-0 bg-gradient-to-br from-[#1F1F1F] to-[#271066] animate-pulse flex items-center justify-center">
          {fallbackIcon === "spec" ? (
            <Layers className="h-6 w-6 text-white/20" />
          ) : (
            <GraduationCap className="h-6 w-6 text-white/20" />
          )}
        </div>
      )}

      {status === "error" ? (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0056D2]/80 to-[#271066]">
          {fallbackIcon === "spec" ? (
            <Layers className="h-8 w-8 text-white/40" />
          ) : (
            <GraduationCap className="h-8 w-8 text-white/40" />
          )}
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => {
            if (src) imageCache.add(src);
            setStatus("loaded");
          }}
          onError={() => setStatus("error")}
          className={`${className} transition-opacity duration-300 ${
            status === "loaded" ? "opacity-100" : "opacity-0"
          }`}
          {...props}
        />
      )}
    </div>
  );
}
