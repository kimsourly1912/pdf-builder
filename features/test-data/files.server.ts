import "server-only";
// reset_targets is a CTE with table_name / row_key captured before deletion.
const picked = (t: string) =>
  `CAST(rowid AS TEXT) IN (SELECT row_key FROM reset_targets WHERE table_name='${t}')`;
export function resetFilesSql() {
  const sources = [
    "resumes",
    "templates",
    "template_versions",
    "ai_field_detection_runs",
  ].map((t) => `SELECT file_key k FROM ${t} WHERE ${picked(t)}`);
  sources.push(
    `SELECT completed_file_key k FROM submissions WHERE ${picked("submissions")}`,
  );
  sources.push(
    `SELECT file_key k FROM form_submission_artifacts WHERE ${picked("form_submission_artifacts")}`,
  );
  sources.push(
    `SELECT json_extract(j.value,'$.storageKey') k FROM submissions s,json_each(s.values_json) j WHERE CAST(s.rowid AS TEXT) IN (SELECT row_key FROM reset_targets WHERE table_name='submissions') AND j.type='object' AND json_extract(j.value,'$.kind')='submission-image' AND json_extract(j.value,'$.storageKey') LIKE 'forms/'||s.template_id||'/responses/'||s.recipient_link_id||'/%'`,
  );
  sources.push(
    `SELECT json_extract(j.value,'$.storageKey') k FROM form_response_drafts d JOIN recipient_links l ON l.id=d.recipient_link_id,json_each(d.values_json) j WHERE CAST(d.rowid AS TEXT) IN (SELECT row_key FROM reset_targets WHERE table_name='form_response_drafts') AND j.type='object' AND json_extract(j.value,'$.kind')='submission-image' AND json_extract(j.value,'$.storageKey') LIKE 'forms/'||l.template_id||'/responses/'||l.id||'/%'`,
  );
  // Shared source PDFs and other still-referenced files must survive a partial reset.
  const retained = [
    "resumes",
    "templates",
    "template_versions",
    "ai_field_detection_runs",
    "form_submission_artifacts",
  ].map((t) => `SELECT file_key k FROM ${t} WHERE NOT (${picked(t)})`);
  retained.push(
    `SELECT completed_file_key k FROM submissions WHERE NOT (${picked("submissions")})`,
  );
  retained.push(
    `SELECT json_extract(j.value,'$.storageKey') k FROM submissions s,json_each(s.values_json) j WHERE NOT (CAST(s.rowid AS TEXT) IN (SELECT row_key FROM reset_targets WHERE table_name='submissions')) AND j.type='object' AND json_extract(j.value,'$.kind')='submission-image'`,
  );
  retained.push(
    `SELECT json_extract(j.value,'$.storageKey') k FROM form_response_drafts d,json_each(d.values_json) j WHERE NOT (CAST(d.rowid AS TEXT) IN (SELECT row_key FROM reset_targets WHERE table_name='form_response_drafts')) AND j.type='object' AND json_extract(j.value,'$.kind')='submission-image'`,
  );
  const flatten = (queries: string[]) =>
    `SELECT items.value k FROM json_each(json_array(${queries.map((q) => `json((SELECT COALESCE(json_group_array(k),'[]') FROM (${q})))`).join(",")})) groups,json_each(groups.value) items`;
  return `SELECT DISTINCT k FROM (${flatten(sources)}) source WHERE k IS NOT NULL AND k<>'' AND NOT EXISTS(SELECT 1 FROM (${flatten(retained)}) keep WHERE keep.k=source.k)`;
}
