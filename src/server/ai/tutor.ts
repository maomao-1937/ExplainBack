import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output } from "ai";

import type {
  Assessment,
  SupportLevel,
  TrainingStage,
} from "@/lib/domain";
import type { ConceptDraft } from "@/server/repositories/session-repository";
import { createMockTutor } from "@/server/ai/mock-tutor";
import {
  assessmentSchema,
  conceptExtractionSchema,
  supportSchema,
} from "@/server/ai/schemas";
import {
  assessmentSystemPrompt,
  buildAssessmentPrompt,
  buildExtractionPrompt,
  buildSupportPrompt,
  extractionSystemPrompt,
  supportSystemPrompt,
} from "@/server/ai/prompts";

export interface ExtractConceptsInput {
  title: string;
  sourceText: string;
}

export interface AssessAnswerInput {
  conceptTitle: string;
  sourceText: string;
  sourceContext: string;
  question: string;
  userAnswer: string;
  stage: TrainingStage;
}

export interface GenerateSupportInput extends AssessAnswerInput {
  level: Exclude<SupportLevel, 0>;
}

export interface AssessmentResult {
  assessment: Assessment;
  understoodPoints: string[];
  missingPoints: string[];
  misconceptions: string[];
  nextQuestion: string;
}

export interface SupportResult {
  level: Exclude<SupportLevel, 0>;
  content: string;
  nextQuestion: string;
}

export interface AiTutor {
  extractConcepts(input: ExtractConceptsInput): Promise<ConceptDraft[]>;
  assessAnswer(input: AssessAnswerInput): Promise<AssessmentResult>;
  generateSupport(input: GenerateSupportInput): Promise<SupportResult>;
}

export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

function requireAiConfig() {
  const apiKey = process.env.AI_API_KEY;
  const baseURL = process.env.AI_BASE_URL;
  const modelName = process.env.AI_MODEL;

  if (!apiKey || !baseURL || !modelName) {
    throw new AiConfigurationError(
      "真实 AI 模式需要配置 AI_API_KEY、AI_BASE_URL 和 AI_MODEL",
    );
  }

  return { apiKey, baseURL, modelName };
}

export function createProviderTutor(): AiTutor {
  const { apiKey, baseURL, modelName } = requireAiConfig();
  const provider = createOpenAICompatible({
    name: "explainback",
    apiKey,
    baseURL,
  });
  const model = provider.chatModel(modelName);

  return {
    async extractConcepts(input) {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: conceptExtractionSchema }),
        system: extractionSystemPrompt,
        prompt: buildExtractionPrompt(input),
      });

      return output.concepts.map((concept) => ({
        title: concept.title,
        description: concept.description,
        sourceContext: concept.source_context,
      }));
    },

    async assessAnswer(input) {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: assessmentSchema }),
        system: assessmentSystemPrompt,
        prompt: buildAssessmentPrompt(input),
      });

      return {
        assessment: output.assessment,
        understoodPoints: output.understood_points,
        missingPoints: output.missing_points,
        misconceptions: output.misconceptions,
        nextQuestion: output.next_question,
      };
    },

    async generateSupport(input) {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: supportSchema }),
        system: supportSystemPrompt,
        prompt: buildSupportPrompt(input),
      });

      if (output.level !== input.level) {
        throw new Error("AI 返回的支持等级与请求不一致");
      }

      return {
        level: output.level,
        content: output.content,
        nextQuestion: output.next_question,
      };
    },
  };
}

export function getAiTutor(): AiTutor {
  if (process.env.AI_MOCK_MODE === "true") {
    return createMockTutor();
  }
  return createProviderTutor();
}

export function createLazyAiTutor(): AiTutor {
  return {
    extractConcepts: (input) => getAiTutor().extractConcepts(input),
    assessAnswer: (input) => getAiTutor().assessAnswer(input),
    generateSupport: (input) => getAiTutor().generateSupport(input),
  };
}
