import { config } from "../config";

export type TutorChatRole = "user" | "assistant";

export interface TutorChatMessage {
  role: TutorChatRole;
  content: string;
}

interface ChatCompletionRequestMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) return "https://api.openai.com/v1";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function extractErrorMessage(payload: unknown): string | null {
  const root = asObject(payload);
  const error = root ? asObject(root.error) : null;
  const message = error && typeof error.message === "string" ? error.message : null;
  return message ? message.trim() : null;
}

function extractAssistantText(payload: unknown): string | null {
  const root = asObject(payload);
  const choices = root && Array.isArray(root.choices) ? (root.choices as unknown[]) : null;
  const first = choices && choices.length > 0 ? asObject(choices[0]) : null;
  const message = first ? asObject(first.message) : null;
  const content = message && typeof message.content === "string" ? message.content : null;
  return content ? content.trim() : null;
}

export class LearningTutorService {
  isConfigured(): boolean {
    const model = (config.llm.model ?? "").trim();
    const baseUrl = normalizeBaseUrl(config.llm.baseUrl);
    const apiKey = (config.llm.apiKey ?? "").trim();

    if (!model || !baseUrl) {
      return false;
    }

    // If the default OpenAI API is used, an API key is required. For local OpenAI-compatible servers,
    // an API key may not be necessary.
    const usingDefaultOpenAI = baseUrl === "https://api.openai.com/v1";
    return usingDefaultOpenAI ? Boolean(apiKey) : true;
  }

  async chat(input: { topic: string; topicContext?: string; messages: TutorChatMessage[] }): Promise<string> {
    const apiKey = (config.llm.apiKey ?? "").trim();

    const model = (config.llm.model || "").trim();
    if (!model) {
      throw new Error("LLM model is not configured. Set LLM_MODEL in your .env.");
    }

    const baseUrl = normalizeBaseUrl(config.llm.baseUrl);
    const usingDefaultOpenAI = baseUrl === "https://api.openai.com/v1";
    if (usingDefaultOpenAI && !apiKey) {
      throw new Error(
        "LLM is not configured. Set LLM_API_KEY (or OPENAI_API_KEY) for OpenAI, or set LLM_BASE_URL to a local OpenAI-compatible server (LM Studio / Ollama) and set LLM_MODEL."
      );
    }

    const topic = input.topic.trim();
    if (!topic) {
      throw new Error("Missing topic.");
    }

    const topicContext = (input.topicContext ?? "").trim();
    const messages: ChatCompletionRequestMessage[] = [];

    messages.push({
      role: "system",
      content:
        "You are a friendly, concise personal tutor inside a web app. " +
        "Teach the user about the topic they choose.\n\n" +
        "Guidelines:\n" +
        "- Start with a short overview (3-6 bullets).\n" +
        "- Then teach in small chunks, with examples.\n" +
        "- Ask 1-2 quick check questions to confirm understanding.\n" +
        "- If the user is confused, re-explain more simply.\n" +
        "- Keep it practical and actionable.\n" +
        "- Output plain text (no HTML)."
    });

    if (topicContext) {
      messages.push({
        role: "system",
        content: `Topic context (use this to structure the lesson):\n${topicContext}`
      });
    }

    const history = Array.isArray(input.messages) ? input.messages : [];
    for (const message of history) {
      const role = message?.role;
      const content = message?.content;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
        continue;
      }

      const trimmed = content.trim();
      if (!trimmed) {
        continue;
      }

      messages.push({ role, content: trimmed });
    }

    const hasUserMessage = messages.some((message) => message.role === "user");
    if (!hasUserMessage) {
      messages.push({
        role: "user",
        content:
          `I want to learn about: ${topic}\n\n` +
          "Please teach me step-by-step. Start with a 15-minute mini-lesson plan, then begin the lesson. " +
          "End with a couple check questions."
      });
    }

    const url = `${baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.llm.timeoutMs);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };

      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.4
        })
      });

      const text = await response.text().catch(() => "");
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text) as unknown;
        } catch (_error) {
          payload = null;
        }
      }

      if (!response.ok) {
        const message = extractErrorMessage(payload) || (text.trim() ? text.trim() : `LLM request failed (${response.status}).`);
        throw new Error(message);
      }

      const assistantText = extractAssistantText(payload);
      if (!assistantText) {
        throw new Error("LLM returned an empty response.");
      }

      return assistantText;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("LLM request timed out.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
