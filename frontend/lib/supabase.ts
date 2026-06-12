import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export function assertSupabaseEnv() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase public environment variables are missing.");
  }
}

export function getSupabasePublicEnv() {
  assertSupabaseEnv();
  return {
    supabaseUrl,
    supabasePublishableKey
  };
}

export function createBrowserSupabaseClient() {
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicEnv();
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
