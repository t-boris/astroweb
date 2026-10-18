import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const h = vi.hoisted(() => ({
  openAiCreate: null as unknown as Mock,
  geminiGenerate: null as unknown as Mock,
}));

vi.mock("openai", () => ({
  default: class {
    responses = { create: (...a: unknown[]) => h.openAiCreate(...a) };
  },
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: (...a: unknown[]) => h.geminiGenerate(...a) };
  },
  ThinkingLevel: { MINIMAL: "MINIMAL", LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" },
}));

import { findModel, THINKING_HEADROOM_TOKENS } from "../services/ai/models";
import { buildAnthropicBody, callAnthropic } from "../services/ai/providers/anthropic";
import { buildOpenAiParams, callOpenAi } from "../services/ai/providers/openai";
import { buildGeminiParams, callGemini } from "../services/ai/providers/gemini";
import { AiRefusalError, type ProviderRequest } from "../services/ai/providers/types";
import { generateText } from "../services/ai/generate";

const request = (modelId: string, extra: Partial<ProviderRequest> = {}): ProviderRequest => ({
  model: findModel(modelId)!,
  system: "SYS",
  user: "USER",
  maxOutputTokens: 1000,
  ...extra,
});

function claudeResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

let fetchMock: Mock;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-api03-abcdefghijklmnop";
  process.env.OPENAI_API_KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz";
  process.env.GEMINI_API_KEY = "AIzaSyAbcdefghijklmnopqrstuvwxyz0123456";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  h.openAiCreate = vi.fn();
  h.geminiGenerate = vi.fn();
});

describe("Claude transport", () => {
  it("sends temperature only when given, effort for thinking models and the web search tool on request", () => {
    expect(buildAnthropicBody(request("claude-opus-4-8"))).toEqual({
      model: "claude-opus-4-8",
      max_tokens: 1000,
      system: "SYS",
      messages: [{ role: "user", content: "USER" }],
    });
    expect(buildAnthropicBody(request("claude-sonnet-4-6", { temperature: 0.4 })).temperature).toBe(0.4);
    const opus55 = buildAnthropicBody(request("claude-opus-5-5"));
    expect(opus55.output_config).toEqual({ effort: "low" });
    expect(opus55.fallbacks).toBe("default");
    expect(buildAnthropicBody(request("claude-haiku-5-5")).fallbacks).toBeUndefined();
    expect(buildAnthropicBody(request("claude-sonnet-4-6", { webSearch: { maxUses: 2 } })).tools).toEqual([
      { type: "web_search_20250305", name: "web_search", max_uses: 2 },
    ]);
  });

  it("returns only text blocks, the truncation signal and usage", async () => {
    fetchMock.mockResolvedValue(
      claudeResponse({
        model: "claude-sonnet-4-6",
        stop_reason: "max_tokens",
        content: [
          { type: "thinking", thinking: "" },
          { type: "text", text: "Hello " },
          { type: "server_tool_use" },
          { type: "text", text: "world" },
        ],
        usage: { input_tokens: 10, cache_read_input_tokens: 5, output_tokens: 20, server_tool_use: { web_search_requests: 1 } },
      }),
    );
    const result = await callAnthropic(request("claude-sonnet-4-6"));
    expect(result).toEqual({
      text: "Hello world",
      stopReason: "max_tokens",
      model: "claude-sonnet-4-6",
      usage: { inputTokens: 15, outputTokens: 20, webSearches: 1 },
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["x-api-key"]).toBe("sk-ant-api03-abcdefghijklmnop");
  });

  it("turns a refusal into an error and surfaces API errors", async () => {
    fetchMock.mockResolvedValueOnce(claudeResponse({ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] }));
    await expect(callAnthropic(request("claude-opus-5-5"))).rejects.toBeInstanceOf(AiRefusalError);
    fetchMock.mockResolvedValueOnce(claudeResponse({ error: { message: "temperature is deprecated" } }, 400));
    await expect(callAnthropic(request("claude-opus-4-8"))).rejects.toThrow("temperature is deprecated");
  });

  it("refuses to call without a configured key", async () => {
    process.env.ANTHROPIC_API_KEY = "unset";
    await expect(callAnthropic(request("claude-opus-4-8"))).rejects.toThrow("ANTHROPIC_API_KEY is not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("OpenAI transport (DEC-018, REQ-012)", () => {
  it("never stores the response and sends reasoning effort instead of temperature on reasoning models", () => {
    expect(buildOpenAiParams(request("gpt-6-astra"))).toEqual({
      model: "gpt-6-astra",
      instructions: "SYS",
      input: "USER",
      max_output_tokens: 1000,
      store: false,
      reasoning: { effort: "low" },
    });
    expect(buildOpenAiParams(request("gpt-6-luna", { temperature: 0.3 }))).toMatchObject({
      store: false,
      reasoning: { effort: "none" },
      temperature: 0.3,
    });
    expect(buildOpenAiParams(request("gpt-6.1-sol", { webSearch: { maxUses: 2 } })).tools).toEqual([{ type: "web_search" }]);
  });

  it("reads output text, skips reasoning items and counts web searches", async () => {
    h.openAiCreate.mockResolvedValue({
      model: "gpt-6.1-sol",
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [
        { type: "reasoning", summary: [] },
        { type: "web_search_call" },
        { type: "message", content: [{ type: "output_text", text: "Part" }, { type: "output_text", text: " two" }] },
      ],
      usage: { input_tokens: 7, output_tokens: 9 },
    });
    expect(await callOpenAi(request("gpt-6.1-sol"))).toEqual({
      text: "Part two",
      stopReason: "max_tokens",
      model: "gpt-6.1-sol",
      usage: { inputTokens: 7, outputTokens: 9, webSearches: 1 },
    });
    expect(h.openAiCreate.mock.calls[0][0].store).toBe(false);
  });

  it("turns refusals and content filtering into errors", async () => {
    h.openAiCreate.mockResolvedValueOnce({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] });
    await expect(callOpenAi(request("gpt-6-astra"))).rejects.toBeInstanceOf(AiRefusalError);
    h.openAiCreate.mockResolvedValueOnce({ status: "incomplete", incomplete_details: { reason: "content_filter" }, output: [] });
    await expect(callOpenAi(request("gpt-6-astra"))).rejects.toBeInstanceOf(AiRefusalError);
  });

  it("refuses to call with the placeholder key", async () => {
    process.env.OPENAI_API_KEY = "unset";
    await expect(callOpenAi(request("gpt-6-astra"))).rejects.toThrow("OPENAI_API_KEY is not configured");
    expect(h.openAiCreate).not.toHaveBeenCalled();
  });
});

describe("Gemini transport (DEC-018, REQ-012)", () => {
  it("uses generateContent with a system instruction, a thinking level and Google Search on request", () => {
    expect(buildGeminiParams(request("gemini-4-argon", { webSearch: { maxUses: 2 } }))).toEqual({
      model: "gemini-4-argon",
      contents: "USER",
      config: {
        systemInstruction: "SYS",
        maxOutputTokens: 1000,
        thinkingConfig: { thinkingLevel: "LOW" },
        tools: [{ googleSearch: {} }],
      },
    });
  });

  it("skips thought parts and bills thinking tokens as output", async () => {
    h.geminiGenerate.mockResolvedValue({
      modelVersion: "gemini-3.8-flash",
      candidates: [
        {
          finishReason: "MAX_TOKENS",
          content: { parts: [{ text: "thinking...", thought: true }, { text: "Answer" }] },
          groundingMetadata: { webSearchQueries: ["a", "b"] },
        },
      ],
      usageMetadata: { promptTokenCount: 3, toolUsePromptTokenCount: 2, candidatesTokenCount: 4, thoughtsTokenCount: 5 },
    });
    expect(await callGemini(request("gemini-3.8-flash"))).toEqual({
      text: "Answer",
      stopReason: "max_tokens",
      model: "gemini-3.8-flash",
      usage: { inputTokens: 5, outputTokens: 9, webSearches: 2 },
    });
  });

  it("turns safety blocks into errors", async () => {
    h.geminiGenerate.mockResolvedValueOnce({ promptFeedback: { blockReason: "SAFETY" }, candidates: [] });
    await expect(callGemini(request("gemini-4-argon"))).rejects.toBeInstanceOf(AiRefusalError);
    h.geminiGenerate.mockResolvedValueOnce({ candidates: [{ finishReason: "PROHIBITED_CONTENT", content: { parts: [] } }] });
    await expect(callGemini(request("gemini-4-argon"))).rejects.toBeInstanceOf(AiRefusalError);
  });
});

describe("generateText", () => {
  const prompt = { systemInstruction: "SYS", userPrompt: "USER" };

  it("continues a cut-off answer until the end tag, then cleans it and adds up usage and cost", async () => {
    fetchMock
      .mockResolvedValueOnce(
        claudeResponse({ stop_reason: "max_tokens", content: [{ type: "text", text: "First part" }], usage: { input_tokens: 100, output_tokens: 50 } }),
      )
      .mockResolvedValueOnce(
        claudeResponse({ stop_reason: "end_turn", content: [{ type: "text", text: "Second part\n[END_OF_REPORT]" }], usage: { input_tokens: 120, output_tokens: 40 } }),
      );
    const result = await generateText(
      { model: "claude-sonnet-4-6", maxOutputTokens: 1200, temperature: 0.5 },
      prompt,
      { continuation: true, sanitize: true, requireEndTag: "[END_OF_REPORT]" },
    );
    expect(result.text).toBe("First part\n\nSecond part");
    expect(result.usage).toEqual({ inputTokens: 220, outputTokens: 90, webSearches: 0 });
    expect(result.costUsd).toBeCloseTo((220 * 3 + 90 * 15) / 1_000_000);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondBody.messages[0].content).toContain("Continue the SAME answer");
    expect(secondBody.temperature).toBe(0.5);
  });

  it("does not continue when continuation is off and drops temperature for models that reject it", async () => {
    h.openAiCreate.mockResolvedValue({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }] });
    process.env.OPENAI_API_KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz";
    await generateText({ model: "gpt-6-astra", maxOutputTokens: 1500, temperature: 0.7 }, prompt, { continuation: false, sanitize: false });
    const params = h.openAiCreate.mock.calls[0][0];
    expect(params.temperature).toBeUndefined();
    expect(params.max_output_tokens).toBe(1500 + THINKING_HEADROOM_TOKENS);
    expect(h.openAiCreate).toHaveBeenCalledTimes(1);
  });

  it("prices the answer by the model that gave it (Claude's refusal fallback)", async () => {
    fetchMock.mockResolvedValue(
      claudeResponse({ model: "claude-opus-4-8", stop_reason: "end_turn", content: [{ type: "text", text: "Answer" }], usage: { input_tokens: 1000, output_tokens: 1000 } }),
    );
    const result = await generateText({ model: "claude-opus-5-5", maxOutputTokens: 1000, temperature: null }, prompt, { continuation: false, sanitize: false });
    expect(result.model).toBe("claude-opus-4-8");
    expect(result.costUsd).toBeCloseTo((1000 * 5 + 1000 * 25) / 1_000_000);
  });

  it("fails on an empty first answer instead of returning nothing", async () => {
    fetchMock.mockResolvedValue(claudeResponse({ stop_reason: "end_turn", content: [{ type: "text", text: "  " }] }));
    await expect(
      generateText({ model: "claude-haiku-4-5", maxOutputTokens: 500, temperature: 0 }, prompt, { continuation: true, sanitize: false }),
    ).rejects.toThrow("Claude Haiku 4.5 returned an empty response");
  });
});
