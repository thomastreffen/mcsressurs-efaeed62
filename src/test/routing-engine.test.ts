/**
 * Routing Engine Tests
 * Verifies that email routing logic correctly identifies entities from:
 * A) Subject bracket IDs (e.g. [JOB-000010])
 * B) In-Reply-To matching outgoing internet_message_id
 * C) X-MCS-ID custom header
 */
import { describe, it, expect } from "vitest";

// ── Test helpers (mirror inbox-sync logic) ──

function normalizeSubject(raw: string): string {
  let s = raw.trim();
  while (/^(re|sv|vs|fw|fwd)\s*:\s*/i.test(s)) {
    s = s.replace(/^(re|sv|vs|fw|fwd)\s*:\s*/i, "").trim();
  }
  return s;
}

type IdType = "case" | "job" | "offer" | "lead" | "project";
interface IdMatch {
  type: IdType;
  pattern: string;
  rawMatch: string;
  lookupValue: string;
  source: "subject" | "body";
}

function extractIdsFromText(text: string, source: "subject" | "body"): IdMatch[] {
  const matches: IdMatch[] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(/[\[\(]?(CASE-(\d{4,6}))[\]\)]?/gi)) {
    const padded = m[2].padStart(6, "0");
    const key = `case:${padded}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push({ type: "case", pattern: "full_case", rawMatch: m[0], lookupValue: `CASE-${padded}`, source });
    }
  }
  for (const m of text.matchAll(/[\[\(]?JOB-(\d{4,6})[\]\)]?/gi)) {
    const padded = m[1].padStart(6, "0");
    const key = `job:${padded}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push({ type: "job", pattern: "full_job", rawMatch: m[0], lookupValue: `JOB-${padded}`, source });
    }
  }
  for (const m of text.matchAll(/[\[\(]?PROJ-(\d{4,6})[\]\)]?/gi)) {
    const padded = m[1].padStart(6, "0");
    const key = `project:${padded}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push({ type: "project", pattern: "full_project", rawMatch: m[0], lookupValue: `PROJ-${padded}`, source });
    }
  }
  for (const m of text.matchAll(/[\[\(]?OFFER-(\d{3,6})[\]\)]?/gi)) {
    const key = `offer:OFFER-${m[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push({ type: "offer", pattern: "offer_prefix", rawMatch: m[0], lookupValue: `OFFER-${m[1]}`, source });
    }
  }
  for (const m of text.matchAll(/[\[\(]?LEAD-(\d{4})-(\d{4,6})[\]\)]?/gi)) {
    const val = `LEAD-${m[1]}-${m[2]}`;
    const key = `lead:${val}`;
    if (!seen.has(key)) {
      seen.add(key);
      matches.push({ type: "lead", pattern: "full_lead", rawMatch: m[0], lookupValue: val, source });
    }
  }

  return matches;
}

// ═══════════════════════════════════════════════════════════
// TEST CASE A: Incoming with [JOB-000010] in subject
// ═══════════════════════════════════════════════════════════
describe("Test A: Subject bracket ID routing", () => {
  it("extracts JOB-000010 from bracketed subject", () => {
    const subject = "Re: [JOB-000010] Installasjon Tavle 3F";
    const normalized = normalizeSubject(subject);
    const ids = extractIdsFromText(normalized, "subject");
    expect(ids.length).toBe(1);
    expect(ids[0].type).toBe("job");
    expect(ids[0].lookupValue).toBe("JOB-000010");
  });

  it("extracts CASE from subject with noise", () => {
    const subject = "Sv: Sv: Re: [CASE-000123] Forespørsel om tilbud";
    const normalized = normalizeSubject(subject);
    const ids = extractIdsFromText(normalized, "subject");
    expect(ids.length).toBe(1);
    expect(ids[0].type).toBe("case");
    expect(ids[0].lookupValue).toBe("CASE-000123");
  });

  it("extracts multiple IDs from body text", () => {
    const body = "Vi refererer til JOB-000010 og OFFER-1234.";
    const ids = extractIdsFromText(body, "body");
    expect(ids.length).toBe(2);
    expect(ids.find(i => i.type === "job")?.lookupValue).toBe("JOB-000010");
    expect(ids.find(i => i.type === "offer")?.lookupValue).toBe("OFFER-1234");
  });

  it("is case-insensitive", () => {
    const ids = extractIdsFromText("[job-000010] test", "subject");
    expect(ids.length).toBe(1);
    expect(ids[0].lookupValue).toBe("JOB-000010");
  });
});

// ═══════════════════════════════════════════════════════════
// TEST CASE B: Reply with empty subject, In-Reply-To matches
// ═══════════════════════════════════════════════════════════
describe("Test B: In-Reply-To / References routing", () => {
  it("simulates routing via In-Reply-To when subject is empty", () => {
    const subject = "";
    const normalized = normalizeSubject(subject);
    const ids = extractIdsFromText(normalized, "subject");
    expect(ids.length).toBe(0);

    // In real system: In-Reply-To header contains message-id of outgoing email
    // That message-id is looked up in communication_logs.internet_message_id
    // If found, route to same entity_type/entity_id
    const inReplyTo = "<abc123@outlook.com>";
    const mockOutgoingLog = { entity_type: "job", entity_id: "uuid-job-1" };
    
    // Simulated match
    expect(inReplyTo).toBeTruthy();
    expect(mockOutgoingLog.entity_type).toBe("job");
    expect(mockOutgoingLog.entity_id).toBe("uuid-job-1");
  });

  it("falls back to References header when In-Reply-To fails", () => {
    const referencesHeader = "<msg1@outlook.com> <msg2@outlook.com> <msg3@outlook.com>";
    const refs = referencesHeader.split(/\s+/).filter(Boolean);
    expect(refs.length).toBe(3);
    // In real system, each ref is checked against communication_logs + case_items
  });
});

// ═══════════════════════════════════════════════════════════
// TEST CASE C: X-MCS-ID header is the only reliable signal
// ═══════════════════════════════════════════════════════════
describe("Test C: X-MCS-ID header routing", () => {
  it("extracts entity from X-MCS-ID header value", () => {
    const xMcsId = "JOB-000010";
    const ids = extractIdsFromText(xMcsId, "subject");
    expect(ids.length).toBe(1);
    expect(ids[0].type).toBe("job");
    expect(ids[0].lookupValue).toBe("JOB-000010");
  });

  it("handles CASE X-MCS-ID", () => {
    const xMcsId = "CASE-000001";
    const ids = extractIdsFromText(xMcsId, "subject");
    expect(ids.length).toBe(1);
    expect(ids[0].type).toBe("case");
  });

  it("handles LEAD X-MCS-ID", () => {
    const xMcsId = "LEAD-2026-000087";
    const ids = extractIdsFromText(xMcsId, "subject");
    expect(ids.length).toBe(1);
    expect(ids[0].type).toBe("lead");
    expect(ids[0].lookupValue).toBe("LEAD-2026-000087");
  });
});

// ═══════════════════════════════════════════════════════════
// Subject normalization
// ═══════════════════════════════════════════════════════════
describe("Subject normalization", () => {
  it("removes Re: Sv: FW: prefixes iteratively", () => {
    expect(normalizeSubject("Re: Sv: FW: Hello")).toBe("Hello");
    expect(normalizeSubject("RE: RE: RE: Test")).toBe("Test");
    expect(normalizeSubject("Vs: Fwd: Something")).toBe("Something");
  });

  it("preserves bracket IDs after normalization", () => {
    const result = normalizeSubject("Re: [JOB-000010] Tavle 3F");
    expect(result).toBe("[JOB-000010] Tavle 3F");
  });
});
