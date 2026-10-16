import { z } from "zod";

export const REQUIREMENTS = {
  cv_approved: "Current CV approved by HR",
  preparation_ready: "Linked preparation completed",
  forms_submitted: "All linked required forms submitted",
  forms_accepted: "All linked required forms accepted by HR",
  interview_complete: "Linked interview rounds completed with feedback",
} as const;
export type Requirement = keyof typeof REQUIREMENTS;
export const ACTIVITY_TYPES = [
  "inbox",
  "cv_review",
  "forms",
  "interview",
  "offer",
  "custom",
] as const;
export const COLORS = ["neutral", "amber", "blue", "green", "red"] as const;
export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s),
      "Remove control characters.",
    );
export const stageSchema = z.object({
  id: idSchema,
  name: text(80).min(1),
  description: text(500).default(""),
  color: z.enum(COLORS).default("neutral"),
  activity: z.enum(ACTIVITY_TYPES).default("custom"),
  entry: z
    .array(z.enum(Object.keys(REQUIREMENTS) as [Requirement, ...Requirement[]]))
    .max(5)
    .default([]),
  exit: z
    .array(z.enum(Object.keys(REQUIREMENTS) as [Requirement, ...Requirement[]]))
    .max(5)
    .default([]),
});
export const definitionSchema = z
  .object({
    stages: z.array(stageSchema).min(1).max(30),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.stages.map((s) => s.id)).size !== v.stages.length)
      ctx.addIssue({
        code: "custom",
        message: "Each stage needs a unique identity.",
      });
    if (
      new Set(v.stages.map((s) => s.name.toLowerCase())).size !==
      v.stages.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Give each stage a different name.",
      });
  });
export type HiringStage = z.infer<typeof stageSchema>;
export type PipelineDefinition = z.infer<typeof definitionSchema>;
export const pipelineInputSchema = z.object({
  name: text(120).min(2),
  definition: definitionSchema,
});
export const jobInputSchema = z.object({
  title: text(160).min(2),
  pipelineVersionId: idSchema,
});
export type Pipeline = {
  id: string;
  name: string;
  revision: number;
  publishedVersion: number;
  currentVersionId: string | null;
  archived: boolean;
  isDefault: boolean;
  draft: PipelineDefinition;
};
export type PipelineVersion = {
  id: string;
  pipelineId: string;
  name: string;
  version: number;
  definition: PipelineDefinition;
  archived: boolean;
};
export type HiringJob = {
  id: string;
  title: string;
  pipelineVersionId: string;
  revision: number;
  archived: boolean;
};
export type HiringApplication = {
  id: string;
  candidateId: string;
  name: string;
  email: string;
  resumeId: string;
  fileName: string;
  jobId: string | null;
  jobTitle: string;
  pipelineVersionId: string;
  stageId: string;
  revision: number;
  stageEnteredAt: string | null;
  outcome: "hired" | "rejected" | "withdrawn" | null;
  hold: string | null;
  offer: "none" | "draft" | "sent" | "accepted" | "declined";
  interviewId: string | null;
  evidence: ApplicationEvidence;
  createdAt: string;
};
export type ApplicationEvidence = {
  runId?: string;
  assignments?: string[];
  profileId?: string;
};
export type ApplicationEvent = {
  id: string;
  kind: string;
  from: string | null;
  to: string;
  actor: string;
  reason: string;
  at: string;
  status: string;
};
export {
  APPLICATION_TRIGGERS,
  isApplicationTrigger,
} from "../workflows/workflow";
export type { ApplicationTrigger } from "../workflows/workflow";
export function initialDefinition(): PipelineDefinition {
  const stage = (
    id: string,
    name: string,
    activity: HiringStage["activity"],
    color: HiringStage["color"],
    entry: Requirement[] = [],
  ): HiringStage => ({
    id,
    name,
    activity,
    color,
    description: "",
    entry,
    exit: [],
  });
  return {
    stages: [
      stage("applied", "Applied", "inbox", "neutral"),
      stage("screening", "CV screening", "cv_review", "amber"),
      stage("recruiter", "Recruiter call", "interview", "blue", [
        "cv_approved",
      ]),
      stage("technical", "Technical interview", "interview", "blue", [
        "cv_approved",
      ]),
      stage("documents", "Document collection", "forms", "amber"),
      stage("offer", "Offer", "offer", "green"),
    ],
  };
}
export function legacyDefinition(): PipelineDefinition {
  return {
    stages: [
      {
        id: "new",
        name: "New",
        activity: "inbox",
        color: "neutral",
        entry: [],
        exit: [],
        description: "",
      },
      {
        id: "reviewing",
        name: "Reviewing CV",
        activity: "cv_review",
        color: "amber",
        entry: [],
        exit: [],
        description: "",
      },
      {
        id: "approved",
        name: "CV approved",
        activity: "cv_review",
        color: "blue",
        entry: ["cv_approved"],
        exit: [],
        description: "",
      },
      {
        id: "awaiting_forms",
        name: "Awaiting forms",
        activity: "forms",
        color: "amber",
        entry: ["preparation_ready"],
        exit: [],
        description: "",
      },
      {
        id: "ready",
        name: "Forms to review",
        activity: "forms",
        color: "blue",
        entry: ["cv_approved", "preparation_ready", "forms_submitted"],
        exit: [],
        description: "",
      },
      {
        id: "accepted",
        name: "Documents accepted",
        activity: "forms",
        color: "green",
        entry: ["cv_approved", "preparation_ready", "forms_accepted"],
        exit: [],
        description: "",
      },
      {
        id: "interviews",
        name: "Interviews",
        activity: "interview",
        color: "blue",
        entry: ["cv_approved", "preparation_ready", "forms_accepted"],
        exit: [],
        description: "",
      },
      {
        id: "offer",
        name: "Offer",
        activity: "offer",
        color: "green",
        entry: [],
        exit: [],
        description: "",
      },
    ],
  };
}
