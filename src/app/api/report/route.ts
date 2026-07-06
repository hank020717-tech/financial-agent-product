import { NextRequest, NextResponse } from "next/server";
import {
  ChatMessage,
  completeWithContinuation,
  getDeepSeekConfig,
} from "@/lib/deepseek";

type ReportMode = "stock" | "industry" | "bp" | "roadshow";

type ReportTemplate = {
  title: string;
  userLabel: string;
  contextLabel: string;
  sections: string[];
};

const reportTemplates: Record<ReportMode, ReportTemplate> = {
  stock: {
    title: "个股分析",
    userLabel: "标的",
    contextLabel: "补充信息",
    sections: [
      "核心结论与研究摘要",
      "公司业务与收入结构",
      "行业位置与竞争格局",
      "增长驱动、关键假设与催化剂",
      "财务质量、估值观察与同业比较框架",
      "主要风险、跟踪指标与后续研究清单",
    ],
  },
  industry: {
    title: "行业研报",
    userLabel: "行业",
    contextLabel: "研究范围",
    sections: [
      "行业结论摘要",
      "产业链结构与价值分配",
      "市场空间、渗透率与增长驱动",
      "竞争格局、关键公司与商业模式",
      "政策、技术、周期与资本开支影响",
      "投资观察框架、风险因素与跟踪指标",
    ],
  },
  bp: {
    title: "BP 风险分析",
    userLabel: "项目/公司",
    contextLabel: "BP 摘要或商业模式",
    sections: [
      "项目概览与商业模式复述",
      "市场需求与客户验证风险",
      "产品、技术与交付风险",
      "收入模型、单位经济与现金流风险",
      "团队、治理、融资与合规风险",
      "优势、风险优先级与尽调问题清单",
    ],
  },
  roadshow: {
    title: "路演稿生成",
    userLabel: "项目/公司",
    contextLabel: "路演材料要点",
    sections: [
      "开场陈述与项目定位",
      "市场机会与用户痛点",
      "产品方案、技术壁垒与商业模式",
      "增长路径、财务故事与融资用途",
      "团队介绍、里程碑与竞争优势",
      "结尾陈述与投资人问答准备",
    ],
  },
};

const systemPrompt = `你是阿U智能体，一个面向金融市场研究和投融资材料分析的中文 AI 助手。
你要按专业研究报告的方式写作，结构清楚、判断克制、风险意识明确。
你不能承诺收益，不能给出保证性投资结论，也不能替代持牌金融顾问。
如果缺少事实数据，要明确标注“需进一步核验”，不要编造具体财务数据、估值倍数或监管事实。
每一节都要尽量完整展开，使用中文。`;

function isReportMode(mode: string): mode is ReportMode {
  return mode in reportTemplates;
}

function buildSectionPrompt({
  template,
  topic,
  context,
  section,
  sectionIndex,
  totalSections,
}: {
  template: ReportTemplate;
  topic: string;
  context: string;
  section: string;
  sectionIndex: number;
  totalSections: number;
}) {
  return `请生成《${template.title}：${topic}》的第 ${sectionIndex + 1}/${totalSections} 节。

本节标题：${section}

${template.userLabel}：${topic}
${template.contextLabel}：
${context || "用户暂未提供补充材料，请基于通用研究框架展开，并明确提示哪些信息需要进一步核验。"}

写作要求：
1. 只写本节内容，不要写其他章节。
2. 使用 Markdown 标题，从“## ${section}”开始。
3. 内容要充分展开，避免只列提纲。
4. 涉及投资判断时，必须说明仅供研究参考，不构成投资建议。
5. 不要编造具体实时数据；缺少数据时给出应核验的数据清单。`;
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

  let body: { mode?: string; topic?: string; context?: string };

  try {
    body = (await request.json()) as {
      mode?: string;
      topic?: string;
      context?: string;
    };
  } catch {
    return NextResponse.json({ error: "请求内容不是有效的 JSON。" }, { status: 400 });
  }

  const mode = body.mode || "";
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const context = typeof body.context === "string" ? body.context.trim() : "";

  if (!isReportMode(mode)) {
    return NextResponse.json({ error: "请选择有效的智能体能力。" }, { status: 400 });
  }

  if (!topic) {
    return NextResponse.json({ error: "请输入分析对象。" }, { status: 400 });
  }

  const template = reportTemplates[mode];
  const generatedSections: string[] = [];

  try {
    for (const [sectionIndex, section] of template.sections.entries()) {
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: buildSectionPrompt({
            template,
            topic,
            context,
            section,
            sectionIndex,
            totalSections: template.sections.length,
          }),
        },
      ];

      const result = await completeWithContinuation({
        ...config,
        messages,
        maxContinuationRequests: 2,
      });

      generatedSections.push(result.answer);
    }

    const report = [
      `# ${template.title}：${topic}`,
      `> 由阿U智能体生成。内容仅供研究参考，不构成投资建议。`,
      ...generatedSections,
    ].join("\n\n");

    return NextResponse.json({
      mode,
      title: `${template.title}：${topic}`,
      report,
      sectionCount: generatedSections.length,
      model: config.model,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "报告生成失败，请稍后重试。",
      },
      { status: 502 },
    );
  }
}
