import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadInstrumentSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

/*
 * The fonts the site gets from next/font, for the videos: the editor's Geist, and Acme's Inter and Instrument Serif. The
 * site's components read them from CSS variables (layout.tsx), which next/font sets and Remotion does not: `FONT_VARS`
 * sets them on a video's stage.
 */

export const geist = loadGeist("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;
const inter = loadInter("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;
const serif = loadInstrumentSerif("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
loadInstrumentSerif("italic", { weights: ["400"], subsets: ["latin"] });

export const FONT_VARS = {
  "--font-geist": geist,
  "--font-inter": inter,
  "--font-instrument-serif": serif,
} as React.CSSProperties;
