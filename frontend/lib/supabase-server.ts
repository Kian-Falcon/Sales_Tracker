import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicEnv } from "@/lib/supabase";
import type { Department, ViewerDetails } from "@/lib/types";

type CookieStore = Awaited<ReturnType<typeof cookies>>;
type CookieOptions = Parameters<CookieStore["set"]>[2];
type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

export function createServerSupabaseClient() {
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicEnv();
  const cookieStore = cookies();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Some server contexts cannot mutate cookies; ignore those cases.
        }
      }
    }
  });
}

/**
 * Resolves the current viewer's access token (for authorizing server-side calls
 * to the FastAPI backend) and their department (for department-scoped UI).
 * Returns an empty object when there is no active session.
 */
export async function getServerAuth(): Promise<{
  accessToken?: string;
  department?: Department;
  viewer?: ViewerDetails;
}> {
  const supabase = createServerSupabaseClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    return {};
  }

  const department = session.user.user_metadata?.department as Department | undefined;
  const rawName =
    session.user.user_metadata?.full_name ??
    session.user.user_metadata?.fullName ??
    session.user.user_metadata?.name;
  const fullName =
    typeof rawName === "string" && rawName.trim()
      ? rawName.trim()
      : (session.user.email?.split("@")[0] ?? "Workflow user");

  return {
    accessToken: session.access_token,
    department,
    viewer: {
      id: session.user.id,
      email: session.user.email ?? "No email available",
      fullName,
      department: department ?? null
    }
  };
}
