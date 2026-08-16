import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockTutor } from "@/server/ai/mock-tutor";
import type { AiTutor } from "@/server/ai/tutor";
import { createDatabase } from "@/server/db/client";
import { createAnalyticsRepository } from "@/server/repositories/analytics-repository";
import { createSessionRepository } from "@/server/repositories/session-repository";
import { createTrainingRepository } from "@/server/repositories/training-repository";
import {
  requestSupport,
  startTraining,
  submitAttempt,
} from "@/server/services/training-service";

const sourceText =
  "RAG 会先检索与问题相关的外部资料，再把检索结果放入模型上下文，让模型基于这些资料生成答案。这样能补充模型训练数据中没有的新知识。";

describe("training service", () => {
  let directory: string;
  let db: Database.Database;
  let conceptId: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "explainback-training-service-"));
    db = createDatabase(join(directory, "test.db"));
    conceptId = seedConcept(db);
  });

  afterEach(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("先保存 Pending Attempt，再调用 AI；重复请求不重复评估", async () => {
    const training = createTrainingRepository(db);
    const mock = createMockTutor();
    const assessAnswer = vi.fn<AiTutor["assessAnswer"]>(async (input) => {
      expect(training.getTrainingView(conceptId)?.attempts[0]).toMatchObject({
        userAnswer: input.userAnswer,
        processingStatus: "pending",
      });
      return mock.assessAnswer(input);
    });
    const deps = makeDeps(db, { ...mock, assessAnswer });
    const clientRequestId = randomUUID();

    await startTraining(conceptId, deps);
    const first = await submitAttempt(
      conceptId,
      {
        clientRequestId,
        userAnswer:
          "先检索外部资料，再把资料放进上下文，让模型基于资料生成答案。",
      },
      deps,
    );
    const duplicate = await submitAttempt(
      conceptId,
      {
        clientRequestId,
        userAnswer:
          "先检索外部资料，再把资料放进上下文，让模型基于资料生成答案。",
      },
      deps,
    );

    expect(first.training.concept).toMatchObject({
      trainingStage: "validation_probe",
      status: "learning",
    });
    expect(duplicate.attempt.id).toBe(first.attempt.id);
    expect(assessAnswer).toHaveBeenCalledOnce();
    expect(training.getTrainingView(conceptId)?.attempts).toHaveLength(1);
  });

  it("请求仍在 Pending 时收到重复提交，也不会并发调用两次 AI", async () => {
    const mock = createMockTutor();
    let releaseTutor!: () => void;
    let markTutorEntered!: () => void;
    const tutorEntered = new Promise<void>((resolve) => {
      markTutorEntered = resolve;
    });
    const tutorGate = new Promise<void>((resolve) => {
      releaseTutor = resolve;
    });
    const assessAnswer = vi.fn<AiTutor["assessAnswer"]>(async (input) => {
      markTutorEntered();
      await tutorGate;
      return mock.assessAnswer(input);
    });
    const deps = makeDeps(db, { ...mock, assessAnswer });
    const input = {
      clientRequestId: randomUUID(),
      userAnswer: "RAG 就是搜索资料。",
    };

    await startTraining(conceptId, deps);
    const firstRequest = submitAttempt(conceptId, input, deps);
    await tutorEntered;
    const duplicateRequest = submitAttempt(conceptId, input, deps);
    releaseTutor();
    const [first, duplicate] = await Promise.all([
      firstRequest,
      duplicateRequest,
    ]);

    expect(assessAnswer).toHaveBeenCalledOnce();
    expect(duplicate).toMatchObject({
      duplicate: true,
      attempt: { id: first.attempt.id },
    });
  });

  it("AI 失败后保留用户回答并允许重试原 Attempt", async () => {
    const training = createTrainingRepository(db);
    const mock = createMockTutor();
    const assessAnswer = vi
      .fn<AiTutor["assessAnswer"]>()
      .mockRejectedValue(new Error("provider down"));
    const deps = makeDeps(db, { ...mock, assessAnswer });
    const clientRequestId = randomUUID();

    await startTraining(conceptId, deps);
    await expect(
      submitAttempt(
        conceptId,
        { clientRequestId, userAnswer: "RAG 就是搜索资料。" },
        deps,
      ),
    ).rejects.toMatchObject({ name: "TutorOperationError" });

    const failed = training.getAttemptByClientRequestId(clientRequestId);
    expect(failed).toMatchObject({
      processingStatus: "failed",
      userAnswer: "RAG 就是搜索资料。",
    });

    const recovered = await submitAttempt(
      conceptId,
      {
        clientRequestId,
        retryAttemptId: failed!.id,
        userAnswer: "RAG 就是搜索资料。",
      },
      makeDeps(db, mock),
    );

    expect(recovered.attempt).toMatchObject({
      id: failed!.id,
      processingStatus: "completed",
      assessment: "partial",
    });
    expect(training.getTrainingView(conceptId)?.attempts).toHaveLength(1);
  });

  it("Level 3 后强制 Retest，重测正确后掌握并解决 Gap", async () => {
    const mock = createMockTutor();
    const deps = makeDeps(db, mock);
    const training = createTrainingRepository(db);

    await startTraining(conceptId, deps);
    await submitAttempt(
      conceptId,
      {
        clientRequestId: randomUUID(),
        userAnswer: "RAG 就是搜索资料。",
      },
      deps,
    );
    expect(training.getTrainingView(conceptId)?.openGaps.length).toBeGreaterThan(0);

    await requestSupport(conceptId, deps);
    await requestSupport(conceptId, deps);
    const levelThree = await requestSupport(conceptId, deps);
    expect(levelThree.concept).toMatchObject({
      supportLevel: 3,
      trainingStage: "retest",
    });

    const completed = await submitAttempt(
      conceptId,
      {
        clientRequestId: randomUUID(),
        userAnswer:
          "先检索外部资料，再把资料放进上下文，让模型基于资料生成答案。",
      },
      deps,
    );

    expect(completed.training.concept).toMatchObject({
      status: "mastered",
      trainingStage: "complete",
    });
    expect(completed.training.openGaps).toHaveLength(0);
  });
});

function seedConcept(db: Database.Database): string {
  const sessions = createSessionRepository(db);
  const session = sessions.createProcessing({ title: "RAG", sourceText });
  return sessions.replaceConceptsAndMarkReady(session.id, [
    {
      title: "RAG 的作用",
      description: "理解检索如何增强生成",
      sourceContext: sourceText,
    },
  ])[0].id;
}

function makeDeps(db: Database.Database, tutor: AiTutor) {
  return {
    sessions: createSessionRepository(db),
    training: createTrainingRepository(db),
    analytics: createAnalyticsRepository(db),
    tutor,
  };
}
