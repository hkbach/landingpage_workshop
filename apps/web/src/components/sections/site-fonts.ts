import { Inter, Lora, Noto_Sans, Noto_Serif, Poppins } from "next/font/google";

// Fonts for shop sites (allowed list in theme.ts). Each font only defines a CSS variable (applied on the site wrapper
// via siteFontClass), and `preload: false` keeps unused fonts out of the page head: the browser downloads a font file
// only when the site actually uses that family. CJK glyphs come from the fallback stacks in theme.ts.
// next/font options must be written as literals (no spreads/shared constants).

const inter = Inter({ display: "swap", preload: false, subsets: ["latin", "latin-ext", "vietnamese"], variable: "--font-site-inter" });
const notoSans = Noto_Sans({ display: "swap", preload: false, subsets: ["latin", "latin-ext", "vietnamese"], variable: "--font-site-noto-sans" });
const notoSerif = Noto_Serif({ display: "swap", preload: false, subsets: ["latin", "latin-ext", "vietnamese"], variable: "--font-site-noto-serif" });
const lora = Lora({ display: "swap", preload: false, subsets: ["latin", "latin-ext", "vietnamese"], variable: "--font-site-lora" });
// Poppins has no Vietnamese subset: Vietnamese falls back to the next family in the stack.
const poppins = Poppins({ display: "swap", preload: false, subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--font-site-poppins" });

const CLASSES: Record<string, string> = {
  Inter: inter.variable,
  "Noto Sans": notoSans.variable,
  "Noto Serif": notoSerif.variable,
  Lora: lora.variable,
  Poppins: poppins.variable,
};

/** Class that defines the CSS variable of the chosen font (empty for the system font). */
export function siteFontClass(font: string): string {
  return CLASSES[font] ?? "";
}
