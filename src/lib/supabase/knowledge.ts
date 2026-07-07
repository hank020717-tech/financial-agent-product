import { SupabaseClient } from "@supabase/supabase-js";

const maxChunksPerDocument = 24;
const chunkSize = 1400;
const chunkOverlap = 180;
const embeddingDimensions = 1536;
const maxCandidateChunks = 80;

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

export function buildLocalEmbedding(text: string) {
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

function tokenizeKnowledgeText(text: string) {
  const normalized = text.toLowerCase();
  const tokens = new Set<string>();
  const words = normalized.match(/[a-z0-9._-]{2,}|[\u4e00-\u9fff]{2,}/gu) ?? [];

  for (const word of words) {
    tokens.add(word);

    if (/^[\u4e00-\u9fff]+$/u.test(word)) {
      for (let index = 0; index < word.length - 1; index += 1) {
        tokens.add(word.slice(index, index + 2));
      }
    }
  }

  return [...tokens].filter((token) => token.length > 1).slice(0, 80);
}

function getDocumentSummary(
  document:
    | { title?: string | null; source_type?: string | null }
    | { title?: string | null; source_type?: string | null }[]
    | null
    | undefined,
) {
  const normalizedDocument = Array.isArray(document) ? document[0] : document;

  return {
    title: normalizedDocument?.title || "未命名资料",
    sourceType: normalizedDocument?.source_type || "knowledge",
  };
}

function scoreKnowledgeChunk({
  questionTokens,
  content,
  title,
}: {
  questionTokens: string[];
  content: string;
  title: string;
}) {
  const searchableText = `${title}\n${content}`.toLowerCase();

  return questionTokens.reduce((score, token) => {
    if (!searchableText.includes(token)) return score;
    return score + Math.min(token.length, 8);
  }, 0);
}

export function hasKnowledgeQuestionIntent(question: string) {
  return /知识库|上传过|上传的|历史资料|历史文件|保存的|根据.*(资料|文件|报告|分析|内容)|基于.*(资料|文件|报告|分析|内容)|结合.*(资料|文件|报告|分析|内容)|从.*(资料|文件|报告|分析|内容)/u.test(
    question,
  );
}

export type RetrievedKnowledgeChunk = {
  id: string;
  title: string;
  sourceType: string;
  content: string;
  score: number;
  createdAt: string;
};

type KnowledgeChunkRow = {
  id: string;
  content: string;
  created_at: string;
  knowledge_documents?:
    | { title?: string | null; source_type?: string | null }
    | { title?: string | null; source_type?: string | null }[]
    | null;
};

export async function searchKnowledgeChunks({
  supabase,
  question,
  limit = 6,
}: {
  supabase: SupabaseClient;
  question: string;
  limit?: number;
}) {
  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select(
      "id, content, created_at, knowledge_documents(title, source_type)",
    )
    .order("created_at", { ascending: false })
    .limit(maxCandidateChunks);

  if (error) throw error;

  const questionTokens = tokenizeKnowledgeText(question);
  const rows = (data ?? []) as KnowledgeChunkRow[];
  const scoredChunks = rows
    .map((row) => {
      const document = getDocumentSummary(row.knowledge_documents);

      return {
        id: row.id,
        title: document.title,
        sourceType: document.sourceType,
        content: row.content,
        score: scoreKnowledgeChunk({
          questionTokens,
          content: row.content,
          title: document.title,
        }),
        createdAt: row.created_at,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.createdAt.localeCompare(left.createdAt);
    });

  const relevantChunks = scoredChunks.filter((chunk) => chunk.score > 0);
  return (relevantChunks.length > 0 ? relevantChunks : scoredChunks).slice(
    0,
    limit,
  );
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
