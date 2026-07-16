import { NextResponse } from "next/server";
import { withApiTrace } from "@/lib/api-runtime";

export const dynamic = "force-dynamic";

async function handleGet() {
  const isReady = Boolean(
    process.env.DEEPSEEK_API_KEY &&
      process.env.TWELVEDATA_API_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  return NextResponse.json(
    {
      status: isReady ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
    },
    { status: isReady ? 200 : 503 },
  );
}

export const GET = withApiTrace("/api/health", handleGet);
