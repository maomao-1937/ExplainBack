export type ConceptStatus =
  | "not_started"
  | "learning"
  | "needs_review"
  | "mastered";

export type TrainingStage =
  | "initial_explanation"
  | "validation_probe"
  | "targeted_probe"
  | "support"
  | "retest"
  | "complete";

export type Assessment = "correct" | "partial" | "incorrect" | "unclear";

export type AttemptKind = "explanation" | "followup" | "retest";

export type GapType = "missing" | "misconception";

export type GapStatus = "open" | "resolved";

export type SupportLevel = 0 | 1 | 2 | 3;

