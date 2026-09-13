import "server-only";

import { GoogleGenAI } from "@google/genai";

import type { GeminiProposal } from "@/lib/schemas";
import { geminiProposalSchema } from "@/lib/schemas";
import type { ChatMessage, ServiceCandidate, ServiceKind } from "@/lib/types";
import { buildChatPrompt, buildProposalPrompt } from "@/lib/prompts";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const DEBUG = process.env.GEMINI_DEBUG === "1";

const picksJsonSchema = {
  type: "array",
  maxItems: 3,
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: { type: "string" },
      reason: { type: "string" },
    },
    required: ["id", "reason"],
  },
};

// 宿泊・飲食・レジャーを 1 回の生成でまとめて選ばせる
const proposalJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    hotel: picksJsonSchema,
    restaurant: picksJsonSchema,
    leisure: picksJsonSchema,
    message: { type: "string" },
  },
  required: ["hotel", "restaurant", "leisure", "message"],
};

export class GeminiConfigurationError extends Error {}

function debugLog(label: string, value: unknown): void {
  if (!DEBUG) return;

  console.info(`[Gemini:${label}]`, value);
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;

  debugLog("model", MODEL);
  debugLog("apiKeyPresent", Boolean(apiKey));

  if (!apiKey) {
    throw new GeminiConfigurationError("GEMINI_API_KEY is not configured");
  }

  return new GoogleGenAI({ apiKey });
}

export async function requestProposal(
  request: string,
  candidatesByKind: Record<ServiceKind, ServiceCandidate[]>,
): Promise<GeminiProposal | null> {
  const prompt = buildProposalPrompt(request, candidatesByKind);

  debugLog("proposalRequest", {
    request,
    candidateCount: {
      hotel: candidatesByKind.hotel.length,
      restaurant: candidatesByKind.restaurant.length,
      leisure: candidatesByKind.leisure.length,
    },
    promptLength: prompt.length,
  });

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: proposalJsonSchema,
    },
  });

  const rawText = response.text?.trim() ?? "";

  debugLog("proposalResponse", {
    hasText: Boolean(rawText),
    textLength: rawText.length,
    text: rawText,
  });

  if (!rawText) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(rawText);
    const validated = geminiProposalSchema.parse(parsed);

    debugLog("proposalParse", {
      success: true,
      pickCount: {
        hotel: validated.hotel.length,
        restaurant: validated.restaurant.length,
        leisure: validated.leisure.length,
      },
    });

    return validated;
  } catch (error) {
    debugLog("proposalParse", {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });

    return null;
  }
}

export async function requestChat(
  candidates: ServiceCandidate[],
  messages: ChatMessage[],
): Promise<string | null> {
  const prompt = buildChatPrompt(candidates, messages);

  debugLog("chatRequest", {
    candidateCount: candidates.length,
    messageCount: messages.length,
    promptLength: prompt.length,
  });

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: prompt,
  });

  const text = response.text?.trim() ?? "";

  debugLog("chatResponse", {
    hasText: Boolean(text),
    textLength: text.length,
    text,
  });

  return text ? text.slice(0, 2000) : null;
}

export function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /429|quota|rate.?limit|resource.?exhausted/i.test(error.message);
}
