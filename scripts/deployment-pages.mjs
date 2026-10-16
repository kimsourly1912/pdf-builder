export const MANAGEMENT_PAGE_TITLES = {
  "/": "HR Home",
  "/hiring": "Hiring pipeline",
  "/hiring/legacy": "Legacy hiring records",
  "/hiring/pipelines": "Hiring pipelines",
  "/forms": "Form templates",
  "/submissions": "Submitted forms",
  "/administration": "Administration",
  "/setup": "Workspace setup",
  "/setup/preview": "Preview candidate journey",
  "/advanced": "Advanced document tools",
  "/workflows": "Automation",
  "/intake": "Incoming candidates",
  "/archive": "Archive",
  "/test-data": "Test data reset",
  "/candidates": "Candidate Preparation",
  "/interviews": "Interview Progress",
  "/analyses": "AI analysis history",
};

export function managementPageReady(path, html) {
  if (path === "/studio") return html.includes("Drop your PDF here");
  const expected = MANAGEMENT_PAGE_TITLES[path];
  if (!expected) return false;
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "");
  return [...markup.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/giu)].some(
    ([, content]) =>
      content
        .replace(/<[^>]*>/gu, "")
        .replace(/\s+/gu, " ")
        .trim() === expected,
  );
}
