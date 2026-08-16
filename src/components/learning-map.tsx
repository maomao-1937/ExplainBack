"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmptyState, LoadingState } from "@/components/ui-states";
import type { SessionWithConcepts } from "@/server/repositories/session-repository";

export type LearningMapSession = Omit<SessionWithConcepts, "sourceText">;

const statusMeta = {
  not_started: { label: "未开始", action: "开始" },
  learning: { label: "学习中", action: "继续" },
  needs_review: { label: "需复习", action: "复习" },
  mastered: { label: "已掌握", action: "查看" },
} as const;

export function LearningMap({ session }: { session: LearningMapSession }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const retry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const response = await fetch(`/api/sessions/${session.id}/retry-map`, {
        method: "POST",
      });
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        setRetryError(payload.error?.message ?? "重新生成失败，请稍后再试");
        return;
      }
      router.refresh();
    } catch {
      setRetryError("网络连接失败，请稍后再试");
    } finally {
      setRetrying(false);
    }
  };

  if (session.mapStatus === "processing") {
    return <LoadingState label="正在从资料中拆解知识点…" />;
  }

  if (session.mapStatus === "failed") {
    return (
      <div className="state-card state-card--error" role="alert">
        <span className="eyebrow">资料已安全保留</span>
        <h2>学习地图还没有生成</h2>
        <p>{retryError ?? session.mapError ?? "AI 暂时没有完成处理"}</p>
        <button
          className="button button--primary"
          type="button"
          onClick={retry}
          disabled={retrying}
        >
          {retrying ? "正在重新生成…" : "重新生成学习地图"}
        </button>
      </div>
    );
  }

  if (session.concepts.length === 0) {
    return (
      <EmptyState
        eyebrow="未识别到知识点"
        title="换一份更完整的资料试试"
        description="资料需要包含可解释的概念、关系或步骤。"
        actionLabel="创建新的 Session"
        actionHref="/sessions/new"
      />
    );
  }

  const mastered = session.concepts.filter(
    (concept) => concept.status === "mastered",
  ).length;

  return (
    <div className="learning-map">
      <div className="map-summary glass-card">
        <div>
          <span className="eyebrow">Learning map</span>
          <h2>{session.concepts.length} 个知识点，逐个讲明白</h2>
        </div>
        <div className="map-summary__count" aria-label={`${mastered} 个知识点已掌握`}>
          <strong>{mastered}</strong>
          <span>/ {session.concepts.length} 已掌握</span>
        </div>
      </div>

      <ol className="concept-list">
        {session.concepts.map((concept, index) => {
          const meta = statusMeta[concept.status];
          return (
            <li key={concept.id}>
              <Link
                className={`concept-row concept-row--${concept.status}`}
                href={`/sessions/${session.id}/concepts/${concept.id}`}
                aria-label={`${meta.action} ${concept.title}`}
              >
                <span className="concept-row__number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="concept-row__body">
                  <strong>{concept.title}</strong>
                  <small>{concept.description}</small>
                </span>
                <span className="concept-row__status">
                  <i aria-hidden="true" />
                  {meta.label}
                </span>
                <span className="concept-row__action" aria-hidden="true">
                  {meta.action} →
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

