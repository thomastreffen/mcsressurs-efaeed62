import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * classify-attachment
 *
 * Classifies a document (from email or upload) into categories using AI.
 * Categories: image, drawing, fdv, offer, contract, other
 *
 * Body: { document_ids: string[] }
 * - Batch classifies up to 20 documents in one call.
 * - Uses filename + mime_type for fast heuristic, then AI for ambiguous files.
 */

type Category = "image" | "drawing" | "fdv" | "offer" | "contract" | "other";

interface ClassifyResult {
  document_id: string;
  category: Category;
  confidence: number;
  method: "heuristic" | "ai";
}

// Fast heuristic classification based on filename + mime type
function heuristicClassify(fileName: string, mimeType: string): { category: Category; confidence: number } | null {
  const lower = fileName.toLowerCase();
  const ext = lower.split(".").pop() || "";

  // Pure images (photos)
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "bmp", "tiff", "tif"].includes(ext)) {
    // Check if filename hints at drawing
    if (/tegning|drawing|plan|skjema|enlinje|single.?line|layout|diagram|plantegning|fasade|snitt/i.test(lower)) {
      return { category: "drawing", confidence: 0.85 };
    }
    return { category: "image", confidence: 0.7 }; // Might be drawing - let AI decide
  }

  // PDFs - ambiguous, could be anything
  if (ext === "pdf") {
    if (/tegning|drawing|plan|enlinje|single.?line|layout|diagram|plantegning|fasade|snitt/i.test(lower)) {
      return { category: "drawing", confidence: 0.9 };
    }
    if (/fdv|drift|vedlikehold|maintenance|manual|brukervei/i.test(lower)) {
      return { category: "fdv", confidence: 0.9 };
    }
    if (/tilbud|offer|quote|pristilbud|kostnadsoverslag/i.test(lower)) {
      return { category: "offer", confidence: 0.85 };
    }
    if (/kontrakt|contract|avtale|agreement/i.test(lower)) {
      return { category: "contract", confidence: 0.85 };
    }
    return null; // Let AI classify
  }

  // DWG/DXF = technical drawings
  if (["dwg", "dxf", "dwf", "rvt", "ifc"].includes(ext)) {
    return { category: "drawing", confidence: 0.95 };
  }

  // Office docs - ambiguous
  if (["doc", "docx", "xls", "xlsx"].includes(ext)) {
    if (/tegning|drawing|plan/i.test(lower)) return { category: "drawing", confidence: 0.8 };
    if (/fdv|drift|vedlikehold/i.test(lower)) return { category: "fdv", confidence: 0.8 };
    if (/tilbud|offer|quote/i.test(lower)) return { category: "offer", confidence: 0.8 };
    if (/kontrakt|contract|avtale/i.test(lower)) return { category: "contract", confidence: 0.8 };
    return null; // Let AI classify
  }

  return { category: "other", confidence: 0.6 };
}

// AI classification for ambiguous files
async function aiClassifyBatch(
  docs: Array<{ id: string; fileName: string; mimeType: string }>,
  apiKey: string
): Promise<ClassifyResult[]> {
  const prompt = `Du er en filklassifiserer for et norsk elektro/tavlebygg-selskap.

Klassifiser hver fil i NØYAKTIG én av disse kategoriene:
- "image" = Foto, bilde, screenshot (ikke tekniske tegninger)
- "drawing" = Teknisk tegning, enlinjeskjema, plantegning, diagram, skjema, layout
- "fdv" = FDV-dokumentasjon, driftsinstruks, vedlikeholdsmanual, brukerveiledning
- "offer" = Tilbud, pristilbud, kostnadsoverslag, quote
- "contract" = Kontrakt, avtale, agreement
- "other" = Alt annet (brev, notater, generelle dokumenter)

Filer å klassifisere:
${docs.map((d, i) => `${i + 1}. Filnavn: "${d.fileName}" (type: ${d.mimeType})`).join("\n")}

Svar med JSON-array. Hvert element: {"index": <nummer>, "category": "<kategori>", "confidence": <0.0-1.0>}
Kun JSON, ingen annen tekst.`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error(`[classify] AI error: ${response.status}`);
      return docs.map(d => ({ document_id: d.id, category: "other" as Category, confidence: 0.3, method: "ai" as const }));
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("[classify] Could not parse AI response:", content.substring(0, 200));
      return docs.map(d => ({ document_id: d.id, category: "other" as Category, confidence: 0.3, method: "ai" as const }));
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ index: number; category: string; confidence: number }>;
    const validCategories = new Set(["image", "drawing", "fdv", "offer", "contract", "other"]);

    return parsed.map((item) => {
      const docIndex = (item.index || 1) - 1;
      const doc = docs[docIndex];
      if (!doc) return null;
      const cat = validCategories.has(item.category) ? item.category as Category : "other";
      return {
        document_id: doc.id,
        category: cat,
        confidence: Math.min(Math.max(item.confidence || 0.5, 0), 1),
        method: "ai" as const,
      };
    }).filter(Boolean) as ClassifyResult[];
  } catch (err) {
    console.error("[classify] AI classify error:", err);
    return docs.map(d => ({ document_id: d.id, category: "other" as Category, confidence: 0.3, method: "ai" as const }));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const respond = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { document_ids } = await req.json();
    if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
      return respond({ error: "document_ids required" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fetch documents
    const { data: docs, error: fetchErr } = await supabaseAdmin
      .from("documents")
      .select("id, file_name, mime_type")
      .in("id", document_ids.slice(0, 20))
      .is("deleted_at", null);

    if (fetchErr || !docs || docs.length === 0) {
      return respond({ error: "No documents found" }, 404);
    }

    const results: ClassifyResult[] = [];
    const needsAi: Array<{ id: string; fileName: string; mimeType: string }> = [];

    // Pass 1: Heuristic classification
    for (const doc of docs) {
      const hResult = heuristicClassify(doc.file_name, doc.mime_type);
      if (hResult && hResult.confidence >= 0.8) {
        results.push({
          document_id: doc.id,
          category: hResult.category,
          confidence: hResult.confidence,
          method: "heuristic",
        });
      } else {
        needsAi.push({ id: doc.id, fileName: doc.file_name, mimeType: doc.mime_type });
      }
    }

    // Pass 2: AI classification for ambiguous files
    if (needsAi.length > 0) {
      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      if (apiKey) {
        const aiResults = await aiClassifyBatch(needsAi, apiKey);
        results.push(...aiResults);
      } else {
        // Fallback: everything ambiguous goes to "other"
        for (const doc of needsAi) {
          results.push({ document_id: doc.id, category: "other", confidence: 0.3, method: "heuristic" });
        }
      }
    }

    // Update documents with AI classification
    for (const r of results) {
      await supabaseAdmin
        .from("documents")
        .update({
          ai_category: r.category,
          ai_classified_at: new Date().toISOString(),
          ai_confidence: r.confidence,
          // Also update the main category to match AI suggestion
          category: r.category,
        })
        .eq("id", r.document_id);
    }

    console.log(`[classify] Classified ${results.length} docs (${results.filter(r => r.method === "heuristic").length} heuristic, ${results.filter(r => r.method === "ai").length} AI)`);

    return respond({ ok: true, classified: results.length, results });
  } catch (err) {
    console.error("[classify] Fatal error:", err);
    return respond({ error: String(err) }, 500);
  }
});
