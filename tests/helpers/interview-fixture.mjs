export function insertFixture(db, table, values) {
  const row = { ...values };
  for (const c of db.prepare(`PRAGMA table_info(${table})`).all()) {
    if (c.notnull && c.dflt_value == null && !(c.name in row))
      row[c.name] =
        c.type === "INTEGER"
          ? 1
          : c.name.endsWith("_json")
            ? "{}"
            : "2030-01-01T00:00:00.000Z";
  }
  const keys = Object.keys(row);
  db.prepare(
    `INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
  ).run(...keys.map((k) => row[k]));
}
export function seedAcceptedPreparation(
  db,
  prefix = "a",
  owner = `${prefix}@owner.test`,
) {
  const candidateId = `${prefix}candidate`,
    resumeId = `${prefix}resume`,
    profileId = `${prefix}profile`,
    userId = `${prefix}user`,
    templateId = `${prefix}template`,
    versionId = `${prefix}version`,
    linkId = `${prefix}link`,
    submissionId = `${prefix}submission`,
    assignmentId = `${prefix}assignment`;
  const put = (table, values) => insertFixture(db, table, values);
  put("user", {
    id: userId,
    name: "TEST Candidate",
    email: `${prefix}@candidate.test`,
  });
  put("recipient_profiles", {
    user_id: userId,
    created_by_email: owner,
    account_type: "candidate",
  });
  put("candidates", {
    id: candidateId,
    owner_email: owner,
    full_name: "TEST Sokha Candidate with a long name",
    email: `${prefix}@candidate.test`,
    user_id: userId,
    verification_status: "verified",
  });
  put("resumes", {
    id: resumeId,
    owner_email: owner,
    candidate_id: candidateId,
    file_key: `resumes/${prefix}/cv.pdf`,
    file_name: "TEST accepted CV.pdf",
    file_size: 100,
    content_type: "application/pdf",
    checksum: prefix + "test",
    page_count: 1,
    source: "email",
    received_date: "2030-01-01",
    status: "ready",
    verification_status: "verified",
  });
  put("candidate_profile_versions", {
    id: profileId,
    owner_email: owner,
    candidate_id: candidateId,
    resume_id: resumeId,
    version_number: 1,
    profile_json: "{}",
    source: "manual",
    created_by_email: owner,
    verification_status: "verified",
    verified_at: "2030-01-01T00:00:00.000Z",
  });
  put("templates", {
    id: templateId,
    owner_email: owner,
    name: "TEST Required documents",
    file_key: "templates/test.pdf",
    file_name: "TEST.pdf",
    annotations_json: "[]",
    page_order_json: "[1]",
    current_version_id: versionId,
  });
  put("template_versions", {
    id: versionId,
    template_id: templateId,
    version_number: 1,
    file_key: "templates/test.pdf",
    file_name: "TEST.pdf",
    annotations_json: "[]",
    page_order_json: "[1]",
    roles_json: "[]",
  });
  put("recipient_links", {
    id: linkId,
    template_id: templateId,
    template_version_id: versionId,
    assigned_user_id: userId,
    role_id: "form_user",
    role_name: "Form user",
    role_color: "#2563eb",
    token_hash: prefix + "hash",
    status: "completed",
    submission_count: 1,
    completed_at: "2030-01-01T00:00:00.000Z",
  });
  put("form_assignments", {
    id: assignmentId,
    user_id: userId,
    template_id: templateId,
    template_version_id: versionId,
    recipient_link_id: linkId,
    role_id: "form_user",
    role_name: "Form user",
    role_color: "#2563eb",
    status: "completed",
    completed_at: "2030-01-01T00:00:00.000Z",
    candidate_profile_version_id: profileId,
  });
  put("submissions", {
    id: submissionId,
    template_id: templateId,
    template_version_id: versionId,
    recipient_link_id: linkId,
    values_json: "{}",
    completed_file_key: "submissions/test.pdf",
  });
  put("submission_reviews", {
    submission_id: submissionId,
    owner_email: owner,
    status: "accepted",
    revision: "1",
    reviewed_by: owner,
  });
  return {
    owner,
    candidateId,
    resumeId,
    profileId,
    userId,
    templateId,
    versionId,
    linkId,
    submissionId,
    assignmentId,
  };
}
