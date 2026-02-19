// People Data Labs — person enrichment via phone, email, or name.
// Used during iMessage onboarding and post-signup to identify users.

const PDL_API_KEY = Deno.env.get("PDL_API_KEY") ?? "";
const PDL_BASE = "https://api.peopledatalabs.com/v5/person/enrich";

export interface PDLExperience {
  title: string | null;
  company_name: string | null;
  company_industry: string | null;
  company_size: string | null;
  start_date: string | null;
  end_date: string | null;
  is_primary: boolean;
  summary: string | null;
}

export interface PDLProfile {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  sex: string | null;
  headline: string | null;

  // Current job (best guess from experience array)
  job_title: string | null;
  job_title_role: string | null;
  job_title_sub_role: string | null;
  job_title_levels: string[] | null;
  job_summary: string | null;
  job_start_date: string | null;
  job_company_name: string | null;
  job_company_industry: string | null;
  job_company_size: string | null;
  job_company_website: string | null;
  job_company_location_name: string | null;
  job_company_type: string | null;
  inferred_salary: string | null;
  inferred_years_experience: number | null;

  industry: string | null;
  interests: string[] | null;

  location_name: string | null;
  location_locality: string | null;
  location_region: string | null;
  location_country: string | null;

  linkedin_url: string | null;

  education_school: string | null;
  education_degrees: string[] | null;
  education_majors: string[] | null;

  // Full work history for richer context
  experience: PDLExperience[] | null;
  previous_companies: string[] | null;

  likelihood: number;
}

function parseExperience(raw: any[]): PDLExperience[] {
  return raw
    .filter((e: any) => e.title?.name || e.company?.name)
    .map((e: any) => ({
      title: e.title?.name ?? null,
      company_name: e.company?.name ?? null,
      company_industry: e.company?.industry ?? null,
      company_size: e.company?.size ?? null,
      start_date: e.start_date ?? null,
      end_date: e.end_date ?? null,
      is_primary: e.is_primary === true,
      summary: e.summary ?? null,
    }));
}

function findCurrentJob(experience: PDLExperience[], pdlPrimary: {
  job_title?: string; job_company_name?: string;
}): PDLExperience | null {
  // 1. Entries with no end_date are likely current
  const current = experience.filter((e) => !e.end_date && e.title);
  if (current.length === 1) return current[0];

  // 2. If multiple current entries, pick the most recent start_date.
  //    PDL's is_primary flag is often stale (e.g. side business marked primary
  //    while the actual day job is not). Most recent start = most likely real job.
  if (current.length > 1) {
    const sorted = [...current].sort((a, b) =>
      (b.start_date ?? "").localeCompare(a.start_date ?? ""),
    );
    return sorted[0];
  }

  // 3. If no current entries, use PDL's top-level primary fields
  if (pdlPrimary.job_title) return null;

  // 4. Most recent by start_date
  const sorted = [...experience].sort((a, b) =>
    (b.start_date ?? "").localeCompare(a.start_date ?? ""),
  );
  return sorted[0] ?? null;
}

function parseProfile(body: any): PDLProfile | null {
  const d = body.data ?? body;
  const likelihood: number = body.likelihood ?? d.likelihood ?? 0;

  const edu = Array.isArray(d.education) && d.education.length > 0 ? d.education[0] : null;

  const experience = Array.isArray(d.experience) ? parseExperience(d.experience) : [];

  // Find the actual current job from the experience array
  const currentJob = findCurrentJob(experience, {
    job_title: d.job_title,
    job_company_name: d.job_company_name,
  });

  // Use experience-derived current job if it differs from PDL's top-level
  const jobTitle = currentJob?.title ?? d.job_title ?? null;
  const jobCompanyName = currentJob?.company_name ?? d.job_company_name ?? null;
  const jobStartDate = currentJob?.start_date ?? d.job_start_date ?? null;
  const jobCompanyIndustry = currentJob?.company_industry ?? d.job_company_industry ?? null;
  const jobCompanySize = currentJob?.company_size ?? d.job_company_size ?? null;
  const jobSummary = currentJob?.summary ?? d.job_summary ?? null;

  // Previous companies: all non-current experience entries
  const prevCompanies: string[] = [];
  for (const exp of experience) {
    if (exp.company_name && exp.company_name !== jobCompanyName) {
      if (!prevCompanies.includes(exp.company_name)) {
        prevCompanies.push(exp.company_name);
      }
      if (prevCompanies.length >= 5) break;
    }
  }

  const profile: PDLProfile = {
    full_name: d.full_name ?? null,
    first_name: d.first_name ?? null,
    last_name: d.last_name ?? null,
    sex: d.sex ?? null,
    headline: d.headline ?? null,

    job_title: jobTitle,
    job_title_role: d.job_title_role ?? null,
    job_title_sub_role: d.job_title_sub_role ?? null,
    job_title_levels: d.job_title_levels ?? null,
    job_summary: jobSummary,
    job_start_date: jobStartDate,
    job_company_name: jobCompanyName,
    job_company_industry: jobCompanyIndustry,
    job_company_size: jobCompanySize,
    job_company_website: d.job_company_website ?? null,
    job_company_location_name: d.job_company_location_name ?? null,
    job_company_type: d.job_company_type ?? null,
    inferred_salary: d.inferred_salary ?? null,
    inferred_years_experience: d.inferred_years_experience ?? null,

    industry: d.industry ?? null,
    interests: Array.isArray(d.interests) && d.interests.length > 0 ? d.interests : null,

    location_name: d.location_name ?? null,
    location_locality: d.location_locality ?? null,
    location_region: d.location_region ?? null,
    location_country: d.location_country ?? null,

    linkedin_url: d.linkedin_url ?? null,

    education_school: edu?.school?.name ?? null,
    education_degrees: Array.isArray(edu?.degrees) && edu.degrees.length > 0 ? edu.degrees : null,
    education_majors: Array.isArray(edu?.majors) && edu.majors.length > 0 ? edu.majors : null,

    experience: experience.length > 0 ? experience : null,
    previous_companies: prevCompanies.length > 0 ? prevCompanies : null,

    likelihood,
  };

  console.log(
    `[pdl] Match: ${profile.full_name} | ${profile.job_title} @ ${profile.job_company_name} (likelihood=${likelihood})`,
  );
  if (currentJob && (currentJob.title !== d.job_title || currentJob.company_name !== d.job_company_name)) {
    console.log(
      `[pdl] Overrode PDL primary (${d.job_title} @ ${d.job_company_name}) with experience-derived current job`,
    );
  }

  return profile;
}

async function callPDL(params: URLSearchParams, label: string): Promise<PDLProfile | null> {
  if (!PDL_API_KEY) {
    console.warn("[pdl] No PDL_API_KEY set (env var is empty/missing), skipping enrichment");
    return null;
  }

  if (!params.has("min_likelihood")) params.set("min_likelihood", "3");

  const url = `${PDL_BASE}?${params.toString()}`;

  try {
    console.log(`[pdl] Enriching ${label}`);

    const resp = await fetch(url, {
      method: "GET",
      headers: { "X-Api-Key": PDL_API_KEY, "Accept": "application/json" },
    });

    if (resp.status === 404) {
      console.log(`[pdl] No match found (${label})`);
      return null;
    }

    if (!resp.ok) {
      const detail = await resp.text();
      console.error(`[pdl] API error ${resp.status}: ${detail.slice(0, 300)}`);
      return null;
    }

    const body = await resp.json();

    // Log the raw experience array for debugging
    const rawExp = body.data?.experience ?? body.experience ?? [];
    if (Array.isArray(rawExp) && rawExp.length > 0) {
      console.log(`[pdl] ${rawExp.length} experience entries found:`);
      for (const e of rawExp.slice(0, 5)) {
        console.log(`  - ${e.title?.name ?? "?"} @ ${e.company?.name ?? "?"} (${e.start_date ?? "?"} → ${e.end_date ?? "current"}) primary=${e.is_primary}`);
      }
    }

    return parseProfile(body);
  } catch (e) {
    console.error("[pdl] Enrichment failed:", e);
    return null;
  }
}

// ── Public enrichment functions ──────────────────────────────

export async function enrichByPhone(
  phone: string,
  country = "australia",
): Promise<PDLProfile | null> {
  const cleaned = phone.replace(/\s+/g, "");
  if (!cleaned.startsWith("+")) {
    console.warn(`[pdl] Phone must be E.164 format (got ${cleaned})`);
    return null;
  }

  const params = new URLSearchParams({ phone: cleaned, country });
  return callPDL(params, `phone ${cleaned.slice(0, 6)}***`);
}

export async function enrichByIdentity(opts: {
  name?: string;
  email?: string;
  phone?: string;
  country?: string;
}): Promise<PDLProfile | null> {
  const params = new URLSearchParams();
  if (opts.email) params.set("email", opts.email);
  if (opts.phone) params.set("phone", opts.phone.replace(/\s+/g, ""));
  if (opts.name) params.set("name", opts.name);
  params.set("country", opts.country ?? "australia");
  params.set("min_likelihood", "5");

  const label = opts.email
    ? `identity ${opts.email}`
    : `identity ${opts.name ?? opts.phone ?? "unknown"}`;

  return callPDL(params, label);
}

export function profileToContext(profile: PDLProfile): string {
  const lines: string[] = [];

  if (profile.full_name) lines.push(`Name: ${profile.full_name}`);
  if (profile.sex) lines.push(`Gender: ${profile.sex}`);

  if (profile.job_title) lines.push(`Current Title: ${profile.job_title}`);
  if (profile.job_company_name) {
    let companyLine = `Company: ${profile.job_company_name}`;
    if (profile.job_company_size) companyLine += ` (${profile.job_company_size} employees)`;
    if (profile.job_company_type) companyLine += ` [${profile.job_company_type}]`;
    lines.push(companyLine);
  }
  if (profile.job_company_industry) lines.push(`Company Industry: ${profile.job_company_industry}`);
  if (profile.job_title_role) {
    let roleLine = `Role Category: ${profile.job_title_role}`;
    if (profile.job_title_sub_role) roleLine += ` / ${profile.job_title_sub_role}`;
    lines.push(roleLine);
  }
  if (profile.job_title_levels && profile.job_title_levels.length > 0) {
    lines.push(`Seniority: ${profile.job_title_levels.join(", ")}`);
  }
  if (profile.job_start_date) lines.push(`In Current Role Since: ${profile.job_start_date}`);
  if (profile.job_summary) lines.push(`Job Description: ${profile.job_summary}`);
  if (profile.headline) lines.push(`LinkedIn Headline: ${profile.headline}`);

  if (profile.industry) lines.push(`Personal Industry: ${profile.industry}`);
  if (profile.inferred_years_experience != null) {
    lines.push(`Years of Experience: ~${profile.inferred_years_experience}`);
  }
  if (profile.inferred_salary) lines.push(`Salary Range: ${profile.inferred_salary}`);

  // Full work history for richer context
  if (profile.experience && profile.experience.length > 1) {
    lines.push(`\nFull Work History:`);
    for (const exp of profile.experience) {
      const dates = exp.start_date
        ? `${exp.start_date} → ${exp.end_date ?? "present"}`
        : "";
      const current = !exp.end_date ? " [CURRENT]" : "";
      lines.push(`  - ${exp.title ?? "?"} @ ${exp.company_name ?? "?"}${current} (${dates})`);
    }
  } else if (profile.previous_companies && profile.previous_companies.length > 0) {
    lines.push(`Previous Companies: ${profile.previous_companies.join(", ")}`);
  }

  if (profile.education_school) {
    let eduLine = `University: ${profile.education_school}`;
    if (profile.education_majors) eduLine += ` (${profile.education_majors.join(", ")})`;
    if (profile.education_degrees) eduLine += ` — ${profile.education_degrees.join(", ")}`;
    lines.push(eduLine);
  }

  if (profile.location_name) {
    lines.push(`Location: ${profile.location_name}`);
  } else if (profile.location_locality) {
    lines.push(`Location: ${profile.location_locality}${profile.location_region ? `, ${profile.location_region}` : ""}`);
  }

  if (profile.interests && profile.interests.length > 0) {
    lines.push(`Interests: ${profile.interests.join(", ")}`);
  }

  return lines.join("\n");
}
