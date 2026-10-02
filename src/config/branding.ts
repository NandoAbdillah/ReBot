/**
 * LilyBot Branding & Configuration
 * Single Source of Truth untuk nama produk, identitas, dan aset brand.
 */

export const BRANDING = {
  productName: "LilyBot",
  tagline: "Telegram Automation & Multi-Account Dashboard",
  description: "Kelola bot auto-reply Telegram multi-akun dengan antarmuka anggun, presisi, dan cerdas.",
  companyName: "LilyBot",
  supportUrl: "",
  telegramChannel: "",
  logoPath: "/branding/logo.svg",
  faviconPath: "/branding/favicon.svg",
  themeDefault: "pink-blossom",
} as const;

export const APP_STORAGE_KEYS = {
  theme: "lilybot-theme",
  session: "lilybot-session",
} as const;
