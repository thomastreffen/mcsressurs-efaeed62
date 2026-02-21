import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Invoke an edge function with a timeout (default 20s).
 * Returns { data, error, errorCode } where errorCode can be "ai_timeout" | "rate_limit" | "payment_required".
 */
export async function invokeWithTimeout<T = any>(
  functionName: string,
  body: Record<string, any>,
  timeoutMs = 20000
): Promise<{ data: T | null; error: string | null; errorCode: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
      // @ts-ignore – supabase-js supports signal in recent versions
    });

    clearTimeout(timer);

    if (error) {
      // Check for HTTP status codes encoded in the error
      const msg = error.message || "";
      if (msg.includes("429") || msg.includes("rate limit")) {
        return { data: null, error: "For mange forespørsler. Prøv igjen om litt.", errorCode: "rate_limit" };
      }
      if (msg.includes("402") || msg.includes("payment")) {
        return { data: null, error: "AI-kreditter er oppbrukt.", errorCode: "payment_required" };
      }
      return { data: null, error: msg || "Ukjent feil", errorCode: null };
    }

    if (data?.error) {
      return { data: null, error: data.error, errorCode: data.error_code || null };
    }

    return { data: data as T, error: null, errorCode: null };
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === "AbortError" || err.message?.includes("aborted")) {
      return {
        data: null,
        error: "Forespørselen tok for lang tid. Prøv igjen.",
        errorCode: "ai_timeout",
      };
    }
    return { data: null, error: err.message || "Nettverksfeil", errorCode: "network_error" };
  }
}

/**
 * Handle a Supabase DB write and show appropriate error feedback.
 * Returns true on success, false on failure.
 */
export function handleDbResult(
  result: { error: any },
  successMsg?: string
): boolean {
  if (result.error) {
    const detail = result.error.message || result.error.details || "Ukjent databasefeil";
    toast.error("Lagring feilet", { description: detail });
    console.error("[DB Error]", result.error);
    return false;
  }
  if (successMsg) {
    toast.success(successMsg);
  }
  return true;
}

/**
 * Check if a Graph API error indicates an auth issue (401/403).
 */
export function isGraphAuthError(error: any): boolean {
  if (!error) return false;
  const msg = typeof error === "string" ? error : error.message || "";
  const status = error.status || error.statusCode;
  return (
    status === 401 ||
    status === 403 ||
    msg.includes("401") ||
    msg.includes("403") ||
    msg.includes("InvalidAuthenticationToken") ||
    msg.includes("Authorization_RequestDenied") ||
    msg.includes("ms_reauth")
  );
}
