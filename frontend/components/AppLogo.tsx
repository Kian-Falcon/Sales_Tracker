import Image from "next/image";

import { cn } from "@/lib/utils";

type AppLogoProps = {
  className?: string;
  showWordmark?: boolean;
  showSubtitle?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  align?: "left" | "center";
  tone?: "light" | "dark";
  subtitle?: string;
  priority?: boolean;
};

const logoSizes = {
  sm: {
    frame: "h-11 w-11 rounded-2xl p-2",
    wordmark: "h-10 w-[180px]",
    subtitle: "text-[10px]"
  },
  md: {
    frame: "h-14 w-14 rounded-[20px] p-2.5",
    wordmark: "h-12 w-[216px]",
    subtitle: "text-[11px]"
  },
  lg: {
    frame: "h-16 w-16 rounded-[22px] p-3",
    wordmark: "h-14 w-[260px]",
    subtitle: "text-xs"
  },
  xl: {
    frame: "h-20 w-20 rounded-[26px] p-3.5",
    wordmark: "h-20 w-[360px]",
    subtitle: "text-sm"
  }
} as const;

export function AppLogo({
  className,
  showWordmark = false,
  showSubtitle = false,
  size = "md",
  align = "left",
  tone = "light",
  subtitle = "Workflow Tracker",
  priority = false
}: AppLogoProps) {
  const config = logoSizes[size];

  if (showWordmark) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <div className={cn("relative", config.wordmark)}>
          <Image
            src="/kian-falcon-wordmark.png"
            alt="Kian Falcon"
            fill
            priority={priority}
            sizes={
              size === "xl"
                ? "360px"
                : size === "lg"
                  ? "260px"
                  : size === "md"
                    ? "216px"
                    : "180px"
            }
            className={cn("object-contain", align === "center" ? "object-center" : "object-left")}
          />
        </div>

        {showSubtitle ? (
          <p
            className={cn(
              "font-medium uppercase tracking-[0.16em]",
              config.subtitle,
              tone === "dark" ? "text-white/65" : "text-ink/45"
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center", className)}>
      <div
        className={cn(
          "relative shrink-0 overflow-hidden border shadow-sm",
          config.frame,
          tone === "dark" ? "border-white/15 bg-white/95" : "border-border bg-white"
        )}
      >
        <Image
          src="/kian-falcon-icon.png"
          alt="Kian Falcon logo"
          fill
          priority={priority}
          sizes={size === "lg" ? "64px" : size === "md" ? "56px" : "44px"}
          className="object-contain"
        />
      </div>
    </div>
  );
}
