// Production domain isn't decided yet. Once it is, set NEXT_PUBLIC_SITE_URL
// (see .env.example) and metadataBase / robots / sitemap will pick it up
// automatically — no other code changes needed.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
