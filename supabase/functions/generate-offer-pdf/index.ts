import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsPDF } from "npm:jspdf@2.5.2";
import "npm:jspdf-autotable@3.8.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { calculation_id, created_by } = await req.json();
    if (!calculation_id) throw new Error("calculation_id is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch all data in parallel
    const [calcRes, itemsRes, settingsRes, companyRes, countRes] = await Promise.all([
      supabase.from("calculations").select("*").eq("id", calculation_id).single(),
      supabase.from("calculation_items").select("*").eq("calculation_id", calculation_id).order("type").order("title"),
      supabase.from("settings").select("key, value"),
      supabase.from("company_settings").select("*").limit(1).single(),
      supabase.from("offers").select("id", { count: "exact", head: true }).eq("calculation_id", calculation_id),
    ]);

    const calc = calcRes.data;
    if (calcRes.error || !calc) throw new Error("Kalkulasjon ikke funnet");

    const items = itemsRes.data || [];
    const company = companyRes.data;
    const version = (countRes.count || 0) + 1;

    // Content hash for deduplication
    const hashSource = JSON.stringify({
      items: items.map((i: any) => ({ t: i.title, q: i.quantity, u: i.unit_price, tp: i.type })),
      total: calc.total_price, customer: calc.customer_name, project: calc.project_title,
    });
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hashSource));
    const contentHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

    // Check if latest offer has same hash - skip if unchanged
    const { data: latestOffer } = await supabase
      .from("offers")
      .select("content_hash")
      .eq("calculation_id", calculation_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latestOffer?.content_hash === contentHash) {
      return new Response(JSON.stringify({ error: "Ingen endringer i kalkylen siden forrige tilbud. Ny versjon er ikke nødvendig." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Settings
    let materialMultiplier = 2.0;
    if (settingsRes.data) {
      settingsRes.data.forEach((r: any) => {
        if (r.key === "material_multiplier") materialMultiplier = Number(r.value);
      });
    }

    const materials = items.filter((i: any) => i.type === "material");
    const labor = items.filter((i: any) => i.type === "labor");
    const totalExVat = Number(calc.total_price);
    const totalIncVat = totalExVat * 1.25;
    const today = new Date();
    const validDays = company?.default_offer_valid_days || 30;
    const validUntil = new Date(today.getTime() + validDays * 24 * 60 * 60 * 1000);

    const companyName = company?.company_name || "MCS Service AS";
    const orgNumber = company?.org_number || "";
    const companyEmail = company?.email || "";
    const companyPhone = company?.phone || "";
    const companyAddress = company?.address || "";
    const companyPostal = company?.postal_code || "";
    const companyCity = company?.city || "";
    const companyWebsite = company?.website || "";
    const primaryColor = company?.primary_color || "#2563eb";
    const paymentTerms = company?.default_payment_terms || "Netto 14 dager";
    const offerConditions = company?.default_offer_conditions || "";
    const offerFooter = company?.default_offer_footer || "";

    // Parse primary color to RGB
    const hexToRgb = (hex: string) => {
      const h = hex.replace("#", "");
      return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)] as [number, number, number];
    };
    const brandRgb = hexToRgb(primaryColor);

    const formatDate = (d: Date) => `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getFullYear()}`;
    const formatPrice = (n: number) => n.toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const analysis = calc.ai_analysis as any;
    const assumptions = analysis?.assumptions || [];
    const riskNotes = analysis?.risk_notes || [];

    // ───── LOGO ─────
    let logoImageData: string | null = null;
    const logoUrl = company?.logo_url;
    if (logoUrl) {
      try {
        const logoRes = await fetch(logoUrl);
        if (logoRes.ok) {
          const logoBuffer = await logoRes.arrayBuffer();
          const logoBytes = new Uint8Array(logoBuffer);
          const base64 = btoa(String.fromCharCode(...logoBytes));
          const ext = logoUrl.toLowerCase().includes(".png") ? "PNG" : "JPEG";
          logoImageData = `data:image/${ext.toLowerCase()};base64,${base64}`;
        }
      } catch (e) {
        console.warn("Could not load logo:", e);
      }
    }

    // ───── BUILD PDF ─────
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginL = 20;
    const marginR = 20;
    const contentW = pageW - marginL - marginR;
    let y = 20;

    const addFooter = (pageNum: number, totalPages: number) => {
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      const footerY = pageH - 10;
      doc.line(marginL, footerY - 4, pageW - marginR, footerY - 4);
      const footerParts = [companyName, orgNumber ? `Org.nr: ${orgNumber}` : "", companyWebsite].filter(Boolean);
      doc.text(footerParts.join(" • "), marginL, footerY);
      doc.text(`Side ${pageNum} av ${totalPages}`, pageW - marginR, footerY, { align: "right" });
    };

    const checkPage = (needed: number) => {
      if (y + needed > pageH - 20) {
        doc.addPage();
        y = 20;
      }
    };

    // ── HEADER ──
    let headerTextX = marginL;
    if (logoImageData) {
      try {
        doc.addImage(logoImageData, "PNG", marginL, y - 5, 20, 20);
        headerTextX = marginL + 24;
      } catch (e) {
        console.warn("Could not add logo to PDF:", e);
      }
    }
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...brandRgb);
    doc.text(companyName, headerTextX, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    const companySubParts = [companyAddress, `${companyPostal} ${companyCity}`.trim(), companyPhone, companyEmail].filter(Boolean);
    if (companySubParts.length > 0) {
      doc.text(companySubParts.join(" | "), headerTextX, y);
      y += 4;
    }
    if (orgNumber) {
      doc.text(`Org.nr: ${orgNumber}`, headerTextX, y);
      y += 4;
    }

    // Right side: Offer title
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("TILBUD", pageW - marginR, 20, { align: "right" });
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(26, 26, 46);
    doc.text(`v${version}`, pageW - marginR, 27, { align: "right" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Dato: ${formatDate(today)}`, pageW - marginR, 33, { align: "right" });
    doc.text(`Gyldig til: ${formatDate(validUntil)}`, pageW - marginR, 38, { align: "right" });

    // Divider
    y = Math.max(y, 42);
    doc.setDrawColor(...brandRgb);
    doc.setLineWidth(0.8);
    doc.line(marginL, y, pageW - marginR, y);
    y += 10;

    // ── CUSTOMER & PROJECT ──
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(marginL, y, contentW / 2 - 4, 22, 2, 2, "F");
    doc.roundedRect(marginL + contentW / 2 + 4, y, contentW / 2 - 4, 22, 2, 2, "F");

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.setFont("helvetica", "bold");
    doc.text("KUNDE", marginL + 4, y + 6);
    doc.text("PROSJEKT", marginL + contentW / 2 + 8, y + 6);

    doc.setFontSize(11);
    doc.setTextColor(26, 26, 46);
    doc.setFont("helvetica", "bold");
    doc.text(calc.customer_name, marginL + 4, y + 13);
    doc.text(calc.project_title, marginL + contentW / 2 + 8, y + 13);

    if (calc.customer_email) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(calc.customer_email, marginL + 4, y + 18);
    }
    y += 30;

    // ── DESCRIPTION ──
    if (calc.description) {
      checkPage(20);
      doc.setFillColor(240, 249, 255);
      const descLines = doc.splitTextToSize(calc.description, contentW - 12);
      const descH = Math.max(16, descLines.length * 4.5 + 10);
      doc.roundedRect(marginL, y, contentW, descH, 2, 2, "F");
      doc.setDrawColor(...brandRgb);
      doc.setLineWidth(0.6);
      doc.line(marginL, y, marginL, y + descH);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(26, 26, 46);
      doc.text("Beskrivelse:", marginL + 4, y + 6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(descLines, marginL + 4, y + 11);
      y += descH + 6;
    }

    // ── MATERIALS TABLE ──
    if (materials.length > 0) {
      checkPage(20);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(51, 65, 85);
      doc.text("MATERIALER", marginL, y);
      y += 2;

      (doc as any).autoTable({
        startY: y,
        margin: { left: marginL, right: marginR },
        head: [["Beskrivelse", "Antall", "Enhet", "Pris", "Sum"]],
        body: materials.map((m: any) => [
          m.title, String(m.quantity), m.unit || "stk",
          formatPrice(m.unit_price), formatPrice(m.total_price),
        ]),
        styles: { fontSize: 9, cellPadding: 3, textColor: [26, 26, 46], lineColor: [241, 245, 249], lineWidth: 0.3 },
        headStyles: { fillColor: [241, 245, 249], textColor: [100, 116, 139], fontStyle: "bold", fontSize: 8 },
        columnStyles: {
          0: { cellWidth: "auto" },
          1: { halign: "right", cellWidth: 18 },
          2: { halign: "right", cellWidth: 18 },
          3: { halign: "right", cellWidth: 28 },
          4: { halign: "right", cellWidth: 28, fontStyle: "bold" },
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── LABOR TABLE ──
    if (labor.length > 0) {
      checkPage(20);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(51, 65, 85);
      doc.text("ARBEID", marginL, y);
      y += 2;

      (doc as any).autoTable({
        startY: y,
        margin: { left: marginL, right: marginR },
        head: [["Beskrivelse", "Timer", "Timepris", "Sum"]],
        body: labor.map((l: any) => [
          l.title, String(l.quantity), formatPrice(l.unit_price), formatPrice(l.total_price),
        ]),
        styles: { fontSize: 9, cellPadding: 3, textColor: [26, 26, 46], lineColor: [241, 245, 249], lineWidth: 0.3 },
        headStyles: { fillColor: [241, 245, 249], textColor: [100, 116, 139], fontStyle: "bold", fontSize: 8 },
        columnStyles: {
          0: { cellWidth: "auto" },
          1: { halign: "right", cellWidth: 20 },
          2: { halign: "right", cellWidth: 28 },
          3: { halign: "right", cellWidth: 28, fontStyle: "bold" },
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // ── TOTALS ──
    checkPage(50);
    doc.setDrawColor(...brandRgb);
    doc.setLineWidth(0.5);
    doc.line(pageW - marginR - 80, y, pageW - marginR, y);
    y += 6;

    const totalRows = [
      ["Materialer", `kr ${formatPrice(Number(calc.total_material))}`],
      ["Arbeid", `kr ${formatPrice(Number(calc.total_labor))}`],
      ["Sum eks. MVA", `kr ${formatPrice(totalExVat)}`],
      ["MVA (25%)", `kr ${formatPrice(totalExVat * 0.25)}`],
    ];
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    for (const [label, val] of totalRows) {
      doc.text(label, pageW - marginR - 78, y);
      doc.text(val, pageW - marginR, y, { align: "right" });
      y += 6;
    }

    // Grand total
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(pageW - marginR - 80, y - 2, pageW - marginR, y - 2);
    y += 2;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...brandRgb);
    doc.text("Totalt inkl. MVA", pageW - marginR - 78, y);
    doc.text(`kr ${formatPrice(totalIncVat)}`, pageW - marginR, y, { align: "right" });
    y += 12;

    // ── ASSUMPTIONS ──
    if (assumptions.length > 0) {
      checkPage(20);
      doc.setFillColor(239, 246, 255);
      const assLines = assumptions.map((a: string) => `• ${a}`);
      const assH = assLines.length * 5 + 12;
      doc.roundedRect(marginL, y, contentW, assH, 2, 2, "F");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 64, 175);
      doc.text("Forutsetninger", marginL + 4, y + 6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(59, 130, 246);
      let ay = y + 11;
      for (const line of assLines) {
        const wrapped = doc.splitTextToSize(line, contentW - 10);
        doc.text(wrapped, marginL + 4, ay);
        ay += wrapped.length * 4.5;
      }
      y += assH + 4;
    }

    // ── EXCLUSIONS ──
    checkPage(30);
    const exclusions = [
      "Graving og grunnarbeid er ikke inkludert med mindre spesifisert.",
      "Bygningsmessige tilpasninger (hulltaking, branntetning etc.) utføres av andre med mindre avtalt.",
      "Strømforsyning fram til tilkoblingspunkt forutsettes levert av netteier/andre.",
      "Dokumentasjon ut over standard FDV er ikke inkludert.",
    ];
    doc.setFillColor(254, 252, 232);
    const exclH = exclusions.length * 5 + 12;
    doc.roundedRect(marginL, y, contentW, exclH, 2, 2, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(133, 77, 14);
    doc.text("Eksklusjoner", marginL + 4, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(161, 98, 7);
    let ey = y + 11;
    for (const e of exclusions) {
      doc.text(`• ${e}`, marginL + 4, ey);
      ey += 5;
    }
    y += exclH + 4;

    // ── TERMS ──
    checkPage(40);
    const terms = [
      `Tilbudet er gyldig til ${formatDate(validUntil)} (${validDays} dager).`,
      "Priser er eks. MVA med mindre annet er oppgitt.",
      "Arbeid utføres i henhold til gjeldende forskrifter (NEK 400, FEK).",
      "Uforutsette forhold kan medføre tillegg etter medgått tid og materiell.",
      `Betalingsbetingelser: ${paymentTerms}.`,
      "Estimert leveringstid: 2-4 uker etter bestilling, avhengig av materialtilgang.",
      ...riskNotes.map((r: string) => r),
    ];
    if (offerConditions) terms.push(offerConditions);

    doc.setFillColor(248, 250, 252);
    const termsH = terms.length * 5 + 12;
    doc.roundedRect(marginL, y, contentW, termsH, 2, 2, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(51, 65, 85);
    doc.text("Vilkår og forbehold", marginL + 4, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    let ty = y + 11;
    for (const t of terms) {
      const wrapped = doc.splitTextToSize(`• ${t}`, contentW - 10);
      checkPage(wrapped.length * 5);
      doc.text(wrapped, marginL + 4, ty);
      ty += wrapped.length * 4.5;
    }
    y = ty + 8;

    // ── SIGNATURE ──
    checkPage(40);
    y += 10;
    const sigW = contentW / 2 - 10;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(marginL, y, marginL + sigW, y);
    doc.line(marginL + contentW / 2 + 10, y, pageW - marginR, y);
    y += 5;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(26, 26, 46);
    doc.text(`For ${companyName}`, marginL, y);
    doc.text(`For ${calc.customer_name}`, marginL + contentW / 2 + 10, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("Dato: _______________", marginL, y);
    doc.text("Dato: _______________", marginL + contentW / 2 + 10, y);
    y += 5;
    doc.text("Signatur: _______________", marginL, y);
    doc.text("Signatur: _______________", marginL + contentW / 2 + 10, y);

    // ── Footer on all pages ──
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      addFooter(i, totalPages);
    }

    // ── Generate PDF bytes ──
    const pdfArrayBuffer = doc.output("arraybuffer");
    const pdfBytes = new Uint8Array(pdfArrayBuffer);

    // Also build the HTML snapshot for preview
    const html = buildOfferHtml({
      calc, materials, labor, today, validUntil,
      formatDate, formatPrice, assumptions, riskNotes,
      totalExVat, totalIncVat, version, company,
    });

    // Create offer record
    const validUntilStr = validUntil.toISOString().split("T")[0];
    const { data: offer, error: offerErr } = await supabase
      .from("offers")
      .insert({
        calculation_id,
        offer_number: "",
        version,
        status: "draft",
        total_ex_vat: totalExVat,
        total_inc_vat: totalIncVat,
        generated_html_snapshot: html,
        created_by: created_by || calc.created_by,
        valid_until: validUntilStr,
        lead_id: calc.lead_id || null,
        content_hash: contentHash,
      })
      .select()
      .single();

    if (offerErr) throw new Error("Kunne ikke opprette tilbud: " + offerErr.message);

    // Upload PDF to storage
    const pdfFileName = `tilbud-v${version}.pdf`;
    const storagePath = `${offer.id}/${pdfFileName}`;
    await supabase.storage.from("calculation-attachments").upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

    const { data: urlData } = supabase.storage.from("calculation-attachments").getPublicUrl(storagePath);

    // Update offer with PDF URL
    await supabase.from("offers").update({
      generated_pdf_url: urlData.publicUrl,
    }).eq("id", offer.id);

    // Update calculation status
    await supabase.from("calculations").update({ status: "generated" }).eq("id", calculation_id);

    return new Response(JSON.stringify({
      offer_id: offer.id,
      offer_number: offer.offer_number,
      version,
      pdf_url: urlData.publicUrl,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-offer-pdf error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Ukjent feil" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// HTML snapshot for in-app preview (kept for backward compat)
function buildOfferHtml(params: any) {
  const { calc, materials, labor, today, validUntil, formatDate, formatPrice, assumptions, riskNotes, totalExVat, totalIncVat, version, company } = params;
  const companyName = company?.company_name || "MCS Service AS";
  const orgNumber = company?.org_number || "";
  const primaryColor = company?.primary_color || "#2563eb";

  return `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; margin: 0; padding: 40px; font-size: 13px; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid ${primaryColor}; padding-bottom: 20px; }
  .company { font-size: 22px; font-weight: 700; color: ${primaryColor}; }
  .company-sub { font-size: 11px; color: #64748b; margin-top: 4px; }
  .offer-title { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
  .offer-number { font-size: 18px; font-weight: 600; margin-top: 4px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px; }
  .meta-box { background: #f8fafc; border-radius: 8px; padding: 16px; }
  .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; font-weight: 600; margin-bottom: 6px; }
  .meta-value { font-size: 14px; font-weight: 500; }
  .section-title { font-size: 14px; font-weight: 700; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; text-transform: uppercase; letter-spacing: 0.5px; color: #334155; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; padding: 8px 12px; background: #f1f5f9; font-weight: 600; }
  td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
  .num { text-align: right; }
  .total-section { margin-top: 24px; border-top: 2px solid ${primaryColor}; padding-top: 16px; }
  .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
  .total-row.grand { font-size: 20px; font-weight: 700; color: ${primaryColor}; border-top: 2px solid #e2e8f0; padding-top: 12px; margin-top: 8px; }
  .terms { margin-top: 40px; padding: 20px; background: #f8fafc; border-radius: 8px; font-size: 11px; color: #64748b; }
  .terms h4 { margin: 0 0 8px; color: #334155; font-size: 12px; }
  .terms p { margin: 4px 0; }
  .description { margin-bottom: 24px; background: #f0f9ff; padding: 16px; border-radius: 8px; border-left: 4px solid ${primaryColor}; }
  .assumptions { margin-top: 20px; padding: 16px; background: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6; font-size: 11px; }
  .assumptions h4 { margin: 0 0 8px; color: #1e40af; font-size: 12px; }
  .assumptions p { margin: 3px 0; color: #3b82f6; }
  .exclusions { margin-top: 16px; padding: 16px; background: #fefce8; border-radius: 8px; border-left: 4px solid #eab308; font-size: 11px; }
  .exclusions h4 { margin: 0 0 8px; color: #854d0e; font-size: 12px; }
  .exclusions p { margin: 3px 0; color: #a16207; }
  .signature-section { margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; }
  .signature-box { border-top: 1px solid #cbd5e1; padding-top: 8px; }
  .signature-box p { margin: 4px 0; font-size: 11px; color: #64748b; }
  .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }
  .version-badge { display: inline-block; background: #e2e8f0; color: #475569; border-radius: 4px; padding: 2px 8px; font-size: 10px; font-weight: 600; margin-left: 8px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="company">${companyName}</div>
    <div class="company-sub">${orgNumber ? `Org.nr: ${orgNumber}` : ""}</div>
  </div>
  <div style="text-align:right">
    <div class="offer-title">Tilbud</div>
    <div class="offer-number">Genereres automatisk<span class="version-badge">v${version}</span></div>
    <div style="font-size:11px;color:#64748b;margin-top:4px">Dato: ${formatDate(today)}</div>
    <div style="font-size:11px;color:#64748b">Gyldig til: ${formatDate(validUntil)}</div>
  </div>
</div>
<div class="meta-grid">
  <div class="meta-box">
    <div class="meta-label">Kunde</div>
    <div class="meta-value">${calc.customer_name}</div>
    ${calc.customer_email ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${calc.customer_email}</div>` : ""}
  </div>
  <div class="meta-box">
    <div class="meta-label">Prosjekt</div>
    <div class="meta-value">${calc.project_title}</div>
  </div>
</div>
${calc.description ? `<div class="description"><strong>Beskrivelse:</strong><br>${calc.description}</div>` : ""}
${materials.length > 0 ? `
<div class="section-title">Materialer</div>
<table>
  <thead><tr><th>Beskrivelse</th><th class="num">Antall</th><th class="num">Enhet</th><th class="num">Pris</th><th class="num">Sum</th></tr></thead>
  <tbody>
  ${materials.map((m: any) => `<tr><td>${m.title}</td><td class="num">${m.quantity}</td><td class="num">${m.unit}</td><td class="num">${formatPrice(m.unit_price)}</td><td class="num"><strong>${formatPrice(m.total_price)}</strong></td></tr>`).join("")}
  </tbody>
</table>` : ""}
${labor.length > 0 ? `
<div class="section-title">Arbeid</div>
<table>
  <thead><tr><th>Beskrivelse</th><th class="num">Timer</th><th class="num">Timepris</th><th class="num">Sum</th></tr></thead>
  <tbody>
  ${labor.map((l: any) => `<tr><td>${l.title}</td><td class="num">${l.quantity}</td><td class="num">${formatPrice(l.unit_price)}</td><td class="num"><strong>${formatPrice(l.total_price)}</strong></td></tr>`).join("")}
  </tbody>
</table>` : ""}
<div class="total-section">
  <div class="total-row"><span>Materialer</span><span>${formatPrice(Number(calc.total_material))}</span></div>
  <div class="total-row"><span>Arbeid</span><span>${formatPrice(Number(calc.total_labor))}</span></div>
  <div class="total-row"><span>MVA (25%)</span><span>${formatPrice(totalExVat * 0.25)}</span></div>
  <div class="total-row grand"><span>Totalt inkl. MVA</span><span>kr ${formatPrice(totalIncVat)}</span></div>
</div>
${assumptions.length > 0 ? `<div class="assumptions"><h4>Forutsetninger</h4>${assumptions.map((a: string) => `<p>• ${a}</p>`).join("")}</div>` : ""}
<div class="exclusions">
  <h4>Eksklusjoner</h4>
  <p>• Graving og grunnarbeid er ikke inkludert med mindre spesifisert.</p>
  <p>• Bygningsmessige tilpasninger utføres av andre med mindre avtalt.</p>
  <p>• Strømforsyning fram til tilkoblingspunkt forutsettes levert av netteier/andre.</p>
  <p>• Dokumentasjon ut over standard FDV er ikke inkludert.</p>
</div>
<div class="terms">
  <h4>Vilkår og forbehold</h4>
  <p>• Tilbudet er gyldig til ${formatDate(validUntil)}.</p>
  <p>• Priser er eks. MVA med mindre annet er oppgitt.</p>
  <p>• Arbeid utføres i henhold til gjeldende forskrifter (NEK 400, FEK).</p>
  <p>• Uforutsette forhold kan medføre tillegg etter medgått tid og materiell.</p>
  ${riskNotes.length > 0 ? riskNotes.map((r: string) => `<p>• ${r}</p>`).join("") : ""}
</div>
<div class="signature-section">
  <div class="signature-box"><p><strong>For ${companyName}</strong></p><p>Dato: _______________</p><p>Signatur: _______________</p></div>
  <div class="signature-box"><p><strong>For ${calc.customer_name}</strong></p><p>Dato: _______________</p><p>Signatur: _______________</p></div>
</div>
<div class="footer">${companyName}${orgNumber ? ` • Org.nr: ${orgNumber}` : ""}</div>
</body></html>`;
}
