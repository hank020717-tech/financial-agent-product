import { SupabaseClient } from "@supabase/supabase-js";

type SavedMessageRole = "user" | "assistant";

type SaveConversationTurnInput = {
  supabase: SupabaseClient;
  userId: string;
  sessionId: string | null;
  titleSeed: string;
  userContent: string;
  assistantContent: string;
  metadata?: Record<string, unknown>;
  report?: {
    title: string;
    type: string;
    content: string;
    source: string;
  };
};

function buildSessionTitle(text: string) {
  return (
    text
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 36) || "新的对话"
  );
}

async function ensureSession({
  supabase,
  userId,
  sessionId,
  titleSeed,
}: {
  supabase: SupabaseClient;
  userId: string;
  sessionId: string | null;
  titleSeed: string;
}) {
  if (sessionId) {
    await supabase
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("user_id", userId);

    return sessionId;
  }

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({
      user_id: userId,
      title: buildSessionTitle(titleSeed),
    })
    .select("id")
    .single();

  if (error) throw error;

  return data.id as string;
}

export async function saveConversationTurn({
  supabase,
  userId,
  sessionId,
  titleSeed,
  userContent,
  assistantContent,
  metadata = {},
  report,
}: SaveConversationTurnInput) {
  const activeSessionId = await ensureSession({
    supabase,
    userId,
    sessionId,
    titleSeed,
  });

  const messages: Array<{
    session_id: string;
    user_id: string;
    role: SavedMessageRole;
    content: string;
    metadata: Record<string, unknown>;
  }> = [
    {
      session_id: activeSessionId,
      user_id: userId,
      role: "user",
      content: userContent,
      metadata,
    },
    {
      session_id: activeSessionId,
      user_id: userId,
      role: "assistant",
      content: assistantContent,
      metadata,
    },
  ];

  const { error: messageError } = await supabase
    .from("chat_messages")
    .insert(messages);

  if (messageError) throw messageError;

  if (report) {
    const { error: reportError } = await supabase.from("reports").insert({
      user_id: userId,
      session_id: activeSessionId,
      title: report.title,
      report_type: report.type,
      content: report.content,
      source: report.source,
    });

    if (reportError) throw reportError;
  }

  return activeSessionId;
}
