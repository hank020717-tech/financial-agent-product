import JSZip from "jszip";
import { PDFParse } from "pdf-parse";

const maxExtractedCharacters = 60000;

function normalizeText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, maxExtractedCharacters);
}

function stripXml(xml: string) {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s{2,}/g, " ");
}

async function extractDocx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.values(zip.files)
    .filter((file) => file.name.startsWith("word/") && file.name.endsWith(".xml"))
    .sort((a, b) => a.name.localeCompare(b.name));

  const parts = await Promise.all(files.map((file) => file.async("text")));
  return normalizeText(parts.map(stripXml).join("\n\n"));
}

async function extractPptx(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.values(zip.files)
    .filter(
      (file) =>
        file.name.startsWith("ppt/slides/slide") && file.name.endsWith(".xml"),
    )
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const parts = await Promise.all(
    files.map(async (file, index) => {
      const xml = await file.async("text");
      return `第 ${index + 1} 页\n${stripXml(xml)}`;
    }),
  );

  return normalizeText(parts.join("\n\n"));
}

async function extractPdf(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });

  try {
    const data = await parser.getText();
    return normalizeText(data.text || "");
  } finally {
    await parser.destroy();
  }
}

export async function extractTextFromFile(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) {
    return extractPdf(buffer);
  }

  if (name.endsWith(".docx")) {
    return extractDocx(buffer);
  }

  if (name.endsWith(".pptx")) {
    return extractPptx(buffer);
  }

  if (
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv") ||
    name.endsWith(".json")
  ) {
    return normalizeText(buffer.toString("utf8"));
  }

  throw new Error("暂不支持该文件类型。请上传 PDF、DOCX、PPTX、TXT 或 MD 文件。");
}
