export type ApprovalPlan = {
  revision: string;
  contact: { id: string; username: string; confirmed: boolean } | null;
  existingAccount: { id: string; email: string; linked: boolean } | null;
  workflows: {
    id: string;
    name: string;
    version: number;
    continuation: boolean;
    sendsTelegram: boolean;
    forms: { name: string; versionId: string | null }[];
  }[];
};
export const validCandidateEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email.trim()) &&
  email.trim().length <= 254;
