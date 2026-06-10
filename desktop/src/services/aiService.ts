import type { AIConfig } from "../types";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Call an OpenAI-compatible chat completion API.
 * Works with OpenAI, DeepSeek, Ollama, LM Studio, etc.
 */
async function chatCompletion(
  config: AIConfig,
  messages: ChatMessage[],
  maxTokens = 300,
): Promise<string> {
  const url = `${config.apiEndpoint.replace(/\/+$/, "")}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.8,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`AI API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI API returned empty response");
  return content.trim();
}

// ─── Public API ────────────────────────────────────────────

/** Generate note content from a keyword/title */
export async function generateNoteContent(
  config: AIConfig,
  title: string,
  lang: "zh" | "en",
): Promise<string> {
  const systemPrompt =
    lang === "zh"
      ? "你是一个便签助手。用户给你一个标题或关键词，你生成一段简短、温馨、实用的便签内容（50-120字）。直接输出内容，不要加标题或多余解释。"
      : "You are a sticky note assistant. Given a title or keyword, generate short, warm, practical note content (30-80 words). Output content directly, no title or extra explanation.";

  return chatCompletion(config, [
    { role: "system", content: systemPrompt },
    { role: "user", content: title },
  ]);
}

/** Polish / rewrite note content */
export async function polishContent(
  config: AIConfig,
  content: string,
  lang: "zh" | "en",
): Promise<string> {
  const systemPrompt =
    lang === "zh"
      ? "你是一个文案润色助手。请对以下内容进行润色，使其更加流畅、优美。保持原意，不要改变核心信息。直接输出润色后的内容。"
      : "You are a writing assistant. Polish the following content to make it more fluent and elegant. Keep the original meaning. Output directly.";

  return chatCompletion(config, [
    { role: "system", content: systemPrompt },
    { role: "user", content },
  ]);
}

/** Condense / summarize note content */
export async function condenseContent(
  config: AIConfig,
  content: string,
  lang: "zh" | "en",
): Promise<string> {
  const systemPrompt =
    lang === "zh"
      ? "你是一个摘要助手。请将以下内容精简为更短的版本，保留核心要点（不超过原文一半长度）。直接输出精简后的内容。"
      : "You are a summarization assistant. Condense the following content to a shorter version, keeping key points (no more than half the original length). Output directly.";

  return chatCompletion(config, [
    { role: "system", content: systemPrompt },
    { role: "user", content },
  ]);
}

/** Generate daily inspirational quote card */
export async function generateDailyQuote(
  config: AIConfig,
  lang: "zh" | "en",
): Promise<{ title: string; content: string }> {
  const systemPrompt =
    lang === "zh"
      ? "你是一个每日正能量助手。生成一条温馨的每日一句，包含一句励志名言或生活小贴士。格式：第一行是标题（4-8字），换行后是正文（30-60字）。只输出标题和正文，用换行分隔。"
      : "You are a daily inspiration assistant. Generate a warm daily quote with a motivational quote or life tip. Format: first line is title (3-6 words), then content (20-40 words). Only output title and content, separated by newline.";

  const result = await chatCompletion(config, [
    { role: "system", content: systemPrompt },
    { role: "user", content: lang === "zh" ? "生成今天的每日一句" : "Generate today's daily quote" },
  ], 200);

  const lines = result.split("\n").filter((l) => l.trim());
  const title = lines[0]?.replace(/^[#\-*"']+\s*/, "").trim() || (lang === "zh" ? "每日一句" : "Daily Quote");
  const content = lines.slice(1).join("\n").replace(/^["']|["']$/g, "").trim() || result;
  return { title, content };
}

/** Generate holiday greeting card */
export async function generateHolidayGreeting(
  holidayName: string,
  config: AIConfig,
  lang: "zh" | "en",
): Promise<{ title: string; content: string }> {
  const systemPrompt =
    lang === "zh"
      ? "你是一个节日祝福助手。根据节日名称生成一条温馨的节日祝福卡片。格式：第一行是标题（4-8字，如'中秋快乐'），换行后是正文祝福语（30-80字，温暖有诗意）。只输出标题和正文，用换行分隔。"
      : "You are a holiday greeting assistant. Generate a warm holiday greeting card based on the holiday name. Format: first line is title (3-6 words, e.g. 'Happy Mid-Autumn'), then greeting content (20-50 words, warm and poetic). Only output title and content, separated by newline.";

  const result = await chatCompletion(
    config,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: lang === "zh" ? `今天是${holidayName}，请生成节日祝福` : `Today is ${holidayName}, generate a holiday greeting` },
    ],
    200,
  );

  const lines = result.split("\n").filter((l) => l.trim());
  const title = lines[0]?.replace(/^[#\-*"']+\s*/, "").trim() || holidayName;
  const content = lines.slice(1).join("\n").replace(/^["']|["']$/g, "").trim() || result;
  return { title, content };
}
