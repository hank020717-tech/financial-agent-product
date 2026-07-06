import { SupabaseClient } from "@supabase/supabase-js";

const userFilesBucket = "user-files";

function sanitizeFileName(fileName: string) {
  const fallback = "uploaded-file";
  const safeName = fileName
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 90);

  return safeName || fallback;
}

export async function uploadUserFile({
  supabase,
  userId,
  file,
}: {
  supabase: SupabaseClient;
  userId: string;
  file: File;
}) {
  const fileId = crypto.randomUUID();
  const storagePath = `${userId}/${fileId}-${sanitizeFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(userFilesBucket)
    .upload(storagePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const { data, error: insertError } = await supabase
    .from("user_files")
    .insert({
      user_id: userId,
      bucket_id: userFilesBucket,
      storage_path: storagePath,
      file_name: file.name,
      content_type: file.type || null,
      size_bytes: file.size,
    })
    .select("id,bucket_id,storage_path,file_name")
    .single();

  if (insertError) throw insertError;

  return data as {
    id: string;
    bucket_id: string;
    storage_path: string;
    file_name: string;
  };
}

export async function saveFileAnalysisRecord({
  supabase,
  userId,
  fileId,
  sessionId,
  mode,
  title,
  note,
  analysis,
  extractedCharacters,
}: {
  supabase: SupabaseClient;
  userId: string;
  fileId: string;
  sessionId: string | null;
  mode: string;
  title: string;
  note: string;
  analysis: string;
  extractedCharacters: number;
}) {
  const { data, error } = await supabase
    .from("file_analyses")
    .insert({
      user_id: userId,
      file_id: fileId,
      session_id: sessionId,
      mode,
      title,
      note,
      analysis,
      extracted_characters: extractedCharacters,
    })
    .select("id")
    .single();

  if (error) throw error;

  return data.id as string;
}

export async function createSignedFileUrl({
  supabase,
  bucketId,
  storagePath,
}: {
  supabase: SupabaseClient;
  bucketId: string;
  storagePath: string;
}) {
  const { data, error } = await supabase.storage
    .from(bucketId)
    .createSignedUrl(storagePath, 60);

  if (error) throw error;

  return data.signedUrl;
}
