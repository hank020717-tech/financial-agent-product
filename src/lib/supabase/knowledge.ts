import { SupabaseClient } from "@supabase/supabase-js";

const maxChunksPerDocument = 24;
const chunkSize = 1400;
const chunkOverlap = 180;
const embeddingDimensions = 1536;

function splitTextIntoChunks(text: string) {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < normalizedText.length && chunks.length < maxChunksPerDocument) {
    chunks.push(normalizedText.slice(cursor, cursor + chunkSize));
    cursor += chunkSize - chunkOverlap;
  }

  return chunks.filter((chunk) => chunk.trim().length > 0);
}

function hashToken(token: string) {
  let hash = 2166136261;

  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function buildLocalEmbedding(text: string) {
  const vector = new Array<number>(embeddingDimensions).fill(0);
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 360);

  for (const token of tokens) {
    const hash = hashToken(token);
    const index = hash % embeddingDimensions;
    const sign = hash % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }

  const magnitude =
    Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;

  return `[${vector.map((value) => (value / magnitude).toFixed(6)).join(",")}]`;
}

export async function createKnowledgeDocumentFromText({
  supabase,
  userId,
  title,
  content,
  sourceType,
  sourceId,
  metadata = {},
}: {
  supabase: SupabaseClient;
  userId: string;
  title: string;
  content: string;
  sourceType: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
}) {
  const cleanedContent = content.trim();
  if (!cleanedContent) return null;

  const { data: document, error: documentError } = await supabase
    .from("knowledge_documents")
    .insert({
      user_id: userId,
      source_type: sourceType,
      source_id: sourceId || null,
      title,
      content: cleanedContent.slice(0, 60000),
    })
    .select("id")
    .single();

  if (documentError) throw documentError;

  const chunks = splitTextIntoChunks(cleanedContent).map((chunk, index) => ({
    user_id: userId,
    document_id: document.id,
    chunk_index: index,
    content: chunk,
    embedding: buildLocalEmbedding(chunk),
    metadata,
  }));

  if (chunks.length > 0) {
    const { error: chunksError } = await supabase
      .from("knowledge_chunks")
      .insert(chunks);

    if (chunksError) throw chunksError;
  }

  return document.id as string;
}
