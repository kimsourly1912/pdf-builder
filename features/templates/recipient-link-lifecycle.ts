export const DEFAULT_LINK_LIFETIME_DAYS = 30;
export const DEFAULT_MAX_SUBMISSIONS = 1;
export const MAX_LINK_LIFETIME_DAYS = 365;
export const MAX_SUBMISSIONS_PER_LINK = 100;

export type RecipientLinkState =
  | "active"
  | "completed"
  | "expired"
  | "revoked";

export type RecipientLinkLifecycle = {
  status: string;
  expiresAt: string | null;
  maxSubmissions: number;
  submissionCount: number;
};

export type RecipientLinkAvailability = {
  available: boolean;
  state: RecipientLinkState;
  httpStatus: number;
  message: string;
};

export function recipientLinkAvailability(
  link: RecipientLinkLifecycle,
  now = new Date(),
): RecipientLinkAvailability {
  if (link.status === "revoked") {
    return unavailable("revoked", 410, "This fill link has been revoked.");
  }
  if (
    link.status === "expired" ||
    (link.expiresAt && new Date(link.expiresAt).getTime() <= now.getTime())
  ) {
    return unavailable("expired", 410, "This fill link has expired.");
  }
  if (
    link.status === "completed" ||
    link.submissionCount >= link.maxSubmissions
  ) {
    return unavailable(
      "completed",
      409,
      "This fill link has already reached its submission limit.",
    );
  }
  return {
    available: true,
    state: "active",
    httpStatus: 200,
    message: "",
  };
}

export function defaultLinkExpiration(now = new Date()): string {
  return new Date(
    now.getTime() + DEFAULT_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

export function parseLinkExpiration(
  value: unknown,
  now = new Date(),
): string | null | undefined {
  if (value === undefined) return defaultLinkExpiration(now);
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  const maximum = now.getTime() + MAX_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000;
  if (
    !Number.isFinite(date.getTime()) ||
    date.getTime() <= now.getTime() ||
    date.getTime() > maximum
  ) {
    return undefined;
  }
  return date.toISOString();
}

export function parseMaxSubmissions(value: unknown): number | undefined {
  if (value === undefined) return DEFAULT_MAX_SUBMISSIONS;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_SUBMISSIONS_PER_LINK
  ) {
    return undefined;
  }
  return value;
}

export function validIdempotencyKey(value: string | null): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{16,100}$/u.test(value));
}

function unavailable(
  state: Exclude<RecipientLinkState, "active">,
  httpStatus: number,
  message: string,
): RecipientLinkAvailability {
  return { available: false, state, httpStatus, message };
}
