import type { AiTutor, AssessmentResult, SupportResult } from "@/server/ai/tutor";
import {
  assessmentSchema,
  conceptExtractionSchema,
  supportSchema,
} from "@/server/ai/schemas";

function collectExcerpts(sourceText: string): string[] {
  const sentences = sourceText.match(/[^。！？!?\n]+[。！？!?]?/g) ?? [sourceText];
  const excerpts = sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 10)
    .slice(0, 5)
    .map((sentence) => sentence.slice(0, 2_000));

  return excerpts.length > 0 ? excerpts : [sourceText.trim().slice(0, 2_000)];
}

function titleFromExcerpt(excerpt: string, index: number): string {
  const cleaned = excerpt
    .replace(/^#+\s*/, "")
    .replace(/[。！？!?，,：:]$/g, "")
    .trim();
  return cleaned.slice(0, 18) || `核心知识点 ${index + 1}`;
}

function parseAssessment(result: {
  assessment: AssessmentResult["assessment"];
  understood_points: string[];
  missing_points: string[];
  misconceptions: string[];
  next_question: string;
}): AssessmentResult {
  const parsed = assessmentSchema.parse(result);
  return {
    assessment: parsed.assessment,
    understoodPoints: parsed.understood_points,
    missingPoints: parsed.missing_points,
    misconceptions: parsed.misconceptions,
    nextQuestion: parsed.next_question,
  };
}

function parseSupport(result: {
  level: 1 | 2 | 3;
  content: string;
  next_question: string;
}): SupportResult {
  const parsed = supportSchema.parse(result);
  return {
    level: parsed.level,
    content: parsed.content,
    nextQuestion: parsed.next_question,
  };
}

function simulateConfiguredFailure(operation: "extract" | "assess" | "support") {
  if (process.env.AI_MOCK_FAILURE === operation) {
    throw new Error("mock provider exploded");
  }
}

export function createMockTutor(): AiTutor {
  return {
    async extractConcepts(input) {
      simulateConfiguredFailure("extract");
      const raw = conceptExtractionSchema.parse({
        concepts: collectExcerpts(input.sourceText).map((excerpt, index) => ({
          title: titleFromExcerpt(excerpt, index),
          description: "理解这一部分的关键关系，并能用自己的话解释。",
          source_context: excerpt,
        })),
      });

      return raw.concepts.map((concept) => ({
        title: concept.title,
        description: concept.description,
        sourceContext: concept.source_context,
      }));
    },

    async assessAnswer(input) {
      simulateConfiguredFailure("assess");
      const answer = input.userAnswer.toLocaleLowerCase("zh-CN");
      const hasMisconception =
        /(重新?训练|训练.*参数|参数.*训练|写进.*参数)/.test(answer);
      const hasRetrieval = /(检索|搜索|查找|找到.*资料)/.test(answer);
      const hasGeneration = /(生成|上下文|最终答案|回答)/.test(answer);
      const connectsSteps = /(再|然后|之后|放入|加入|基于|利用|使用)/.test(
        answer,
      );

      if (hasMisconception) {
        return parseAssessment({
          assessment: "incorrect",
          understood_points: [],
          missing_points: ["没有说明检索资料如何参与生成"],
          misconceptions: ["把外部知识误解为重新训练进模型参数"],
          next_question: "外部资料是在训练时写入参数，还是回答时放入上下文？",
        });
      }

      if (hasRetrieval && hasGeneration && connectsSteps) {
        return parseAssessment({
          assessment: "correct",
          understood_points: ["说明了先检索资料，再把资料用于生成答案"],
          missing_points: [],
          misconceptions: [],
          next_question: "如果模型不知道今天的新闻，这个流程怎样帮助它回答？",
        });
      }

      if (hasRetrieval || hasGeneration) {
        return parseAssessment({
          assessment: "partial",
          understood_points: hasRetrieval ? ["知道需要先检索资料"] : ["知道要生成答案"],
          missing_points: ["没有解释检索到的资料如何参与生成"],
          misconceptions: [],
          next_question: "搜索到资料以后，它和最终答案是什么关系？",
        });
      }

      return parseAssessment({
        assessment: input.userAnswer.trim().length < 8 ? "unclear" : "incorrect",
        understood_points: [],
        missing_points: ["尚未说明检索与生成的关系"],
        misconceptions: [],
        next_question: "请具体说说资料从哪里来，又怎样影响回答？",
      });
    },

    async generateSupport(input) {
      simulateConfiguredFailure("support");
      const supports: Record<1 | 2 | 3, Omit<SupportResult, "level">> = {
        1: {
          content: "想一想：模型原本不知道最新信息时，回答前可以先做什么？",
          nextQuestion: "检索到资料后，下一步会把它放到哪里？",
        },
        2: {
          content: "对比一下：A. 重新训练模型；B. 把资料放入本次回答的上下文。",
          nextQuestion: "哪一种更符合资料描述，它怎样影响生成？",
        },
        3: {
          content: "RAG 先检索相关外部资料，再把资料加入当前上下文，让模型基于这些内容生成答案，而不是重新训练模型参数。",
          nextQuestion: "现在请重新完整解释 RAG 如何使用外部资料。",
        },
      };
      const support = supports[input.level];

      return parseSupport({
        level: input.level,
        content: support.content,
        next_question: support.nextQuestion,
      });
    },
  };
}
