import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function createSupabaseBrowserClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Supabase 还没有配置。请在 .env.local 中设置 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY。",
    );
  }

  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
