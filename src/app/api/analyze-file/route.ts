import { NextRequest, NextResponse } from "next/server";
import {
  ChatMessage,
  completeWithContinuation,
  getDeepSeekConfig,
} from "@/lib/deepseek";
import { extractTextFromFile } from "@/lib/file-text";
import { getAuthenticatedSupabaseUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

type FileAnalysisMode = "bp" | "roadshow" | "contract" | "research";

const maxUploadBytes = 20 * 1024 * 1024;
const supportedFileNamePattern = /\.(pdf|docx|pptx|txt|md|csv|json)$/i;

const modeLabels: Record<FileAnalysisMode, string> = {
  bp: "BP 风险分析",
  roadshow: "路演稿生成",
  contract: "合同审查",
  research: "研报解读",
};

const modeInstructions: Record<FileAnalysisMode, string[]> = {
  bp: [
    "复述项目商业模式与核心假设",
    "识别市场、产品、技术、商业化、团队、融资和合规风险",
    "按高/中/低优先级给出风险排序",
    "给出尽调问题清单和需要补充的数据材料",
  ],
  roadshow: [
    "提炼项目定位、市场机会、产品方案和商业模式",
    "生成可用于演讲的路演稿正文",
    "补充投资人可能追问的问题与回答方向",
    "指出材料中表达不清或证据不足的位置",
  ],
  contract: [
    "概括合同主题、交易结构和关键义务",
    "识别付款、交付、违约、终止、保密、知识产权、争议解决等条款风险",
    "列出需要律师或专业人士进一步确认的问题",
    "给出修改建议，但不要冒充法律意见",
  ],
  research: [
    "提炼研报核心观点和关键假设",
    "拆解行业逻辑、公司逻辑、估值逻辑和风险逻辑",
    "指出报告中需要核验的数据、结论和潜在偏见",
    "整理后续跟踪指标和研究问题",
  ],
};

function isAnalysisMode(mode: string): mode is FileAnalysisMode {
  return mode in modeLabels;
}

function buildPrompt({
  mode,
  fileName,
  extractedText,
  note,
}: {
  mode: FileAnalysisMode;
  fileName: string;
  extractedText: string;
  note: string;
}) {
  const instructions = modeInstructions[mode]
    .map((instruction, index) => `${index + 1}. ${instruction}`)
    .join("\n");

  return `请基于用户上传的文件生成《${modeLabels[mode]}》。

文件名：${fileName}
用户补充说明：
${note || "无"}

分析任务：
${instructions}

写作要求：
1. 使用 Markdown，结构完整，不要只写提纲。
2. 如果文件内容不足或疑似提取不完整，要明确说明。
3. 不要编造文件中不存在的具体事实、数据或条款。
4. 金融内容仅供研究参考，不构成投资建议；合同内容仅供文本审查参考，不构成法律意见。

文件提取文本如下：
---
${extractedText}
---`;
}

export async function POST(request: NextRequest) {
  let config: ReturnType<typeof getDeepSeekConfig>;

  try {
    config = getDeepSeekConfig();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "DeepSeek API Key 还没有配置。",
      },
      { status: 500 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const mode = String(formData.get("mode") || "");
    const note = String(formData.get("note") || "").trim();
    const accessToken = String(formData.get("accessToken") || "").trim();

    try {
      await getAuthenticatedSupabaseUser(accessToken);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "请先登录后再分析文件。",
        },
        { status: 401 },
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请先上传文件。" }, { status: 400 });
    }

    if (file instanceof File && file.size > maxUploadBytes) {
      return NextResponse.json(
        { error: "文件过大，请上传 20MB 以内的文件。" },
        { status: 413 },
      );
    }

    if (file instanceof File && !supportedFileNamePattern.test(file.name)) {
      return NextResponse.json(
        { error: "暂不支持该文件类型，请上传 PDF、DOCX、PPTX、TXT、MD、CSV 或 JSON 文件。" },
        { status: 400 },
      );
    }

    if (!isAnalysisMode(mode)) {
      return NextResponse.json({ error: "请选择有效的文件分析类型。" }, { status: 400 });
    }

    const extractedText = await extractTextFromFile(file);

    if (!extractedText) {
      return NextResponse.json(
        { error: "没有从文件中提取到可分析文本。" },
        { status: 400 },
      );
    }

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "你是阿U智能体，擅长金融材料、商业计划书、合同和研报的结构化分析。你必须基于用户提供的文件文本回答，缺少事实时要提示核验。",
      },
      {
        role: "user",
        content: buildPrompt({
          mode,
          fileName: file.name,
          extractedText,
          note,
        }),
      },
    ];

    const result = await completeWithContinuation({
      ...config,
      messages,
      maxContinuationRequests: 3,
    });

    return NextResponse.json({
      title: `${modeLabels[mode]}：${file.name}`,
      analysis: result.answer,
      extractedCharacters: extractedText.length,
      knowledgeText: extractedText.slice(0, 60000),
      model: config.model,
      wasContinued: result.wasContinued,
      finishReason: result.finishReason,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "文件分析失败，请稍后重试。",
      },
      { status: 502 },
    );
  }
}
