/**
 * Tailwind v4's theme, as Human Touch's Variables panel lists it for a project on Tailwind (read from the product's panel
 * on the Vite + React 19 + Tailwind v4 example, 2026-11-11): its color ramps from 50 to 950, its named colors, spacing,
 * radius, font size and shadow.
 */

export const STEPS = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];

export const TAILWIND_RAMPS: [string, string[]][] = [
  ["red", ["FEF2F2", "FFE2E2", "FFC9C9", "FFA2A2", "FF6467", "FB2C36", "E7000B", "C10007", "9F0712", "82181A", "460809"]],
  ["orange", ["FFF7ED", "FFEDD4", "FFD6A8", "FFB86A", "FF8904", "FF6900", "F54A00", "CA3500", "9F2D00", "7E2A0C", "441306"]],
  ["amber", ["FFFBEB", "FEF3C6", "FEE685", "FFD230", "FFB900", "FE9A00", "E17100", "BB4D00", "973C00", "7B3306", "461901"]],
  ["yellow", ["FEFCE8", "FEF9C2", "FFF085", "FFDF20", "FDC700", "F0B100", "D08700", "A65F00", "894B00", "733E0A", "432004"]],
  ["lime", ["F7FEE7", "ECFCCA", "D8F999", "BBF451", "9AE600", "7CCF00", "5EA500", "497D00", "3C6300", "35530E", "192E03"]],
  ["green", ["F0FDF4", "DBFCE7", "B9F8CF", "7BF1A8", "05DF72", "00C950", "00A63E", "008236", "016630", "0D542B", "032E15"]],
  ["emerald", ["ECFDF5", "D0FAE5", "A4F4CF", "5EE9B5", "00D492", "00BC7D", "009966", "007A55", "006045", "004F3B", "002C22"]],
  ["teal", ["F0FDFA", "CBFBF1", "96F7E4", "46EDD5", "00D5BE", "00BBA7", "009689", "00786F", "005F5A", "0B4F4A", "022F2E"]],
  ["cyan", ["ECFEFF", "CEFAFE", "A2F4FD", "53EAFD", "00D3F3", "00B8DB", "0092B8", "007595", "005F78", "104E64", "053345"]],
  ["sky", ["F0F9FF", "DFF2FE", "B8E6FE", "74D4FF", "00BCFF", "00A6F4", "0084D1", "0069A8", "00598A", "024A70", "052F4A"]],
  ["blue", ["EFF6FF", "DBEAFE", "BEDBFF", "8EC5FF", "50A2FF", "2B7FFF", "155DFC", "1447E6", "193CB8", "1C398E", "162556"]],
  ["indigo", ["EEF2FF", "E0E7FF", "C6D2FF", "A3B3FF", "7C86FF", "615FFF", "4F39F6", "432DD7", "372AAC", "312C85", "1E1A4D"]],
  ["violet", ["F5F3FF", "EDE9FE", "DDD6FF", "C4B4FF", "A684FF", "8E51FF", "7F22FE", "7008E7", "5D0EC0", "4D179A", "2F0D68"]],
  ["purple", ["FAF5FF", "F3E8FF", "E9D4FF", "DAB2FF", "C27AFF", "AD46FF", "9810FA", "8200DB", "6E11B0", "59168B", "3C0366"]],
  ["fuchsia", ["FDF4FF", "FAE8FF", "F6CFFF", "F4A8FF", "ED6AFF", "E12AFB", "C800DE", "A800B7", "8A0194", "721378", "4B004F"]],
  ["pink", ["FDF2F8", "FCE7F3", "FCCEE8", "FDA5D5", "FB64B6", "F6339A", "E60076", "C6005C", "A3004C", "861043", "510424"]],
  ["rose", ["FFF1F2", "FFE4E6", "FFCCD3", "FFA1AD", "FF637E", "FF2056", "EC003F", "C70036", "A50036", "8B0836", "4D0218"]],
  ["slate", ["F8FAFC", "F1F5F9", "E2E8F0", "CAD5E2", "90A1B9", "62748E", "45556C", "314158", "1D293D", "0F172B", "020618"]],
  ["gray", ["F9FAFB", "F3F4F6", "E5E7EB", "D1D5DC", "99A1AF", "6A7282", "4A5565", "364153", "1E2939", "101828", "030712"]],
  ["zinc", ["FAFAFA", "F4F4F5", "E4E4E7", "D4D4D8", "9F9FA9", "71717B", "52525C", "3F3F47", "27272A", "18181B", "09090B"]],
  ["neutral", ["FAFAFA", "F5F5F5", "E5E5E5", "D4D4D4", "A1A1A1", "737373", "525252", "404040", "262626", "171717", "0A0A0A"]],
  ["stone", ["FAFAF9", "F5F5F4", "E7E5E4", "D6D3D1", "A6A09B", "79716B", "57534D", "44403B", "292524", "1C1917", "0C0A09"]],
  ["mauve", ["FAFAFA", "F3F1F3", "E7E4E7", "D7D0D7", "A89EA9", "79697B", "594C5B", "463947", "2A212C", "1D161E", "0C090C"]],
  ["olive", ["FBFBF9", "F4F4F0", "E8E8E3", "D8D8D0", "ABAB9C", "7C7C67", "5B5B4B", "474739", "2B2B22", "1D1D16", "0C0C09"]],
  ["mist", ["F9FBFB", "F1F3F3", "E3E7E8", "D0D6D8", "9CA8AB", "67787C", "4B585B", "394447", "22292B", "161B1D", "090B0C"]],
  ["taupe", ["FBFAF9", "F3F1F1", "E8E4E3", "D8D2D0", "ABA09C", "7C6D67", "5B4F4B", "473C39", "2B2422", "1D1816", "0C0A09"]],
];

export const TAILWIND_NAMED: [string, string][] = [
  ["black", "#000000"],
  ["white", "#FFFFFF"],
];

export const TAILWIND_SPACING: [string, number][] = [
  ["0", 0], ["px", 1], ["0.5", 2], ["1", 4], ["1.5", 6], ["2", 8], ["2.5", 10], ["3", 12], ["3.5", 14], ["4", 16], ["5", 20], ["6", 24],
  ["7", 28], ["8", 32], ["9", 36], ["10", 40], ["11", 44], ["12", 48], ["14", 56], ["16", 64], ["20", 80], ["24", 96], ["28", 112],
  ["32", 128], ["36", 144], ["40", 160], ["44", 176], ["48", 192], ["52", 208], ["56", 224], ["60", 240], ["64", 256], ["72", 288],
  ["80", 320], ["96", 384],
];

export const TAILWIND_RADIUS: [string, number][] = [["xs", 2], ["sm", 4], ["md", 6], ["lg", 8], ["xl", 12], ["2xl", 16], ["3xl", 24], ["4xl", 32]];

export const TAILWIND_FONT_SIZE: [string, number][] = [
  ["xs", 12], ["sm", 14], ["base", 16], ["lg", 18], ["xl", 20], ["2xl", 24], ["3xl", 30], ["4xl", 36], ["5xl", 48], ["6xl", 60], ["7xl", 72], ["8xl", 96], ["9xl", 128],
];

export const TAILWIND_SHADOW: [string, string][] = [
  ["2xs", "0 1px rgb(0 0 0 / 0.05)"],
  ["xs", "0 1px 2px 0 rgb(0 0 0 / 0.05)"],
  ["sm", "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)"],
  ["md", "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)"],
  ["lg", "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)"],
  ["xl", "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)"],
  ["2xl", "0 25px 50px -12px rgb(0 0 0 / 0.25)"],
];
