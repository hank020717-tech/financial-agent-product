import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";

const require = createRequire(import.meta.url);
const filePath = process.argv[2];

if (!filePath) {
  console.error("Missing PDF file path.");
  process.exit(1);
}

const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
PDFParse.setWorker(pathToFileURL(workerPath).toString());

const buffer = await readFile(filePath);
const parser = new PDFParse({ data: buffer });

try {
  const result = await parser.getText();
  process.stdout.write(JSON.stringify({ text: result.text || "" }));
} finally {
  await parser.destroy();
}
