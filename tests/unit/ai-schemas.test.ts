import { describe, expect, it } from "vitest";

import {
  assessmentSchema,
  conceptExtractionSchema,
  sourceContainsContext,
  supportSchema,
} from "@/server/ai/schemas";

describe("AI output schemas", () => {
  it("接受 1～10 个有资料原文的知识点", () => {
    expect(
      conceptExtractionSchema.parse({
        concepts: [
          {
            title: "检索",
            description: "理解如何找到相关资料",
            source_context: "先检索相关资料",
          },
        ],
      }).concepts,
    ).toHaveLength(1);
  });

  it("拒绝非法判断枚举和一次提出多个问题", () => {
    expect(
      assessmentSchema.safeParse({
        assessment: "mostly-right",
        understood_points: [],
        missing_points: [],
        misconceptions: [],
        next_question: "为什么？然后呢？",
      }).success,
    ).toBe(false);

    expect(
      assessmentSchema.safeParse({
        assessment: "partial",
        understood_points: [],
        missing_points: ["缺少生成关系"],
        misconceptions: [],
        next_question: "为什么？然后呢？",
      }).success,
    ).toBe(false);
  });

  it("拒绝 correct 同时携带遗漏或误解", () => {
    expect(
      assessmentSchema.safeParse({
        assessment: "correct",
        understood_points: ["已解释检索和生成"],
        missing_points: ["仍有遗漏"],
        misconceptions: [],
        next_question: "换一个场景还成立吗？",
      }).success,
    ).toBe(false);
  });

  it("拒绝错误支持等级和超过 120 字的 Level 3 内容", () => {
    const base = {
      content: "想想外部资料进入上下文以后发生了什么。",
      next_question: "外部资料怎样影响最终答案？",
    };

    expect(supportSchema.safeParse({ ...base, level: 0 }).success).toBe(false);
    expect(
      supportSchema.safeParse({
        ...base,
        level: 3,
        content: "这".repeat(121),
      }).success,
    ).toBe(false);
  });
});

describe("sourceContainsContext", () => {
  it("忽略空白差异，但不接受资料中不存在的概括", () => {
    const source = "RAG 会先检索资料，\n\n再把资料放入上下文辅助生成。";

    expect(
      sourceContainsContext(source, "先检索资料， 再把资料放入上下文"),
    ).toBe(true);
    expect(sourceContainsContext(source, "RAG 能保证答案永远正确")).toBe(false);
  });
});

