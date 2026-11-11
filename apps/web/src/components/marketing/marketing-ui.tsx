import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** The title of a hero: the key word in blue with a line under it (<hl>), the rest of the line in a light italic (<em>). */
export const heroRich = {
  hl: (c: ReactNode) => <span className="text-cyan-400 underline decoration-cyan-400/70 decoration-[3px] underline-offset-[10px]">{c}</span>,
  em: (c: ReactNode) => <em className="font-light italic text-white/95">{c}</em>,
};

/** The dark hero with the glow of the reference design: deep blue with a teal and violet light, and a field of small stars. */
export function Hero({ badge, title, subtitle, children, compact = false }: { badge: string; title: ReactNode; subtitle: string; children?: ReactNode; compact?: boolean }) {
  return (
    <section className="relative isolate overflow-hidden" data-testid="marketing-hero">
      <div aria-hidden className="absolute inset-0 -z-10" style={{
        background: "radial-gradient(60% 55% at 80% 20%, rgba(34,211,238,0.30), transparent 70%), radial-gradient(55% 60% at 100% 55%, rgba(99,102,241,0.38), transparent 70%), radial-gradient(50% 50% at 10% 0%, rgba(14,165,233,0.16), transparent 70%), linear-gradient(180deg, #050b1f 0%, #07122e 60%, #050b1f 100%)",
      }} />
      <div aria-hidden className="absolute inset-0 -z-10 opacity-60" style={{
        backgroundImage: "radial-gradient(1px 1px at 20px 30px, #fff, transparent), radial-gradient(1px 1px at 120px 80px, #bae6fd, transparent), radial-gradient(1.5px 1.5px at 200px 20px, #fff, transparent), radial-gradient(1px 1px at 280px 140px, #e0f2fe, transparent)",
        backgroundSize: "320px 180px", maskImage: "linear-gradient(180deg, #000 0%, transparent 85%)", WebkitMaskImage: "linear-gradient(180deg, #000 0%, transparent 85%)",
      }} />
      <div className={cn("mx-auto max-w-5xl px-4 text-center sm:px-6", compact ? "pb-14 pt-16 sm:pb-20 sm:pt-24" : "pb-16 pt-16 sm:pb-24 sm:pt-24")}>
        <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/90 shadow-[0_0_24px_rgba(34,211,238,0.25)] backdrop-blur">{badge}</span>
        {/* The size comes before the line height: tailwind-merge drops a line height that comes before a font size. */}
        <h1 className={cn("mt-6 font-semibold tracking-tight text-white", compact ? "text-4xl sm:text-5xl lg:text-6xl" : "text-[2.5rem] sm:text-6xl lg:text-7xl", "leading-[1.1]")}>{title}</h1>
        <p className="mx-auto mt-6 max-w-2xl text-base text-white/75 sm:text-lg">{subtitle}</p>
        {children}
      </div>
    </section>
  );
}

/** The call to action of the reference design: a light-blue pill. */
export const ctaPrimary = "inline-flex h-12 w-full items-center justify-center sm:w-auto gap-2 rounded-full bg-cyan-400 px-8 text-base font-semibold text-slate-950 shadow-[0_0_32px_rgba(34,211,238,0.35)] outline-none transition hover:bg-cyan-300 focus-visible:ring-2 focus-visible:ring-white";
export const ctaSecondary = "inline-flex h-12 w-full items-center justify-center sm:w-auto gap-2 rounded-full border border-white/25 bg-white/5 px-8 text-base font-medium text-white outline-none transition hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-cyan-300";

export function SectionHeading({ eyebrow, title, intro, id }: { eyebrow?: string; title: string; intro?: string; id: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow ? <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">{eyebrow}</p> : null}
      <h2 id={id} className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
      {intro ? <p className="mt-4 text-base text-white/70 sm:text-lg">{intro}</p> : null}
    </div>
  );
}

/** A card with an icon, a title and a sentence or two. */
export function FeatureCard({ icon: Icon, title, body, tone = "cyan" }: { icon: LucideIcon; title: string; body: string; tone?: "cyan" | "violet" | "emerald" | "amber" }) {
  const tones = { cyan: "bg-cyan-400/15 text-cyan-300", violet: "bg-violet-400/15 text-violet-300", emerald: "bg-emerald-400/15 text-emerald-300", amber: "bg-amber-400/15 text-amber-300" };
  return (
    <li className="group rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition hover:-translate-y-0.5 hover:border-cyan-400/40 hover:bg-white/[0.07]">
      <span className={cn("grid size-11 place-items-center rounded-xl", tones[tone])}><Icon className="size-5" aria-hidden /></span>
      <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-white/70">{body}</p>
    </li>
  );
}
