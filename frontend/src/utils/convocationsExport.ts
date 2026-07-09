import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Convocation } from "../api/convocationsApi";

export type ConvocationsExportContext = {
  convocations: Convocation[];
  totalCount: number;
  scopeLabel: string;
  filterDescription: string | null;
  exportedAt: string;
  formatDateHeure: (iso: string | null) => string;
};

const HEADERS = [
  "Candidat",
  "N° inscription",
  "Concours",
  "Centre",
  "Établissement",
  "Salle",
  "Date / heure",
  "Place",
  "E-mail",
] as const;

function cell(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return String(value);
}

function toPdfText(text: string): string {
  return text
    .replace(/\u2192/g, " a ")
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\u00B7/g, " - ")
    .replace(/\u00A0/g, " ");
}

function pdfCell(value: string | number | null | undefined): string {
  return toPdfText(cell(value));
}

function candidatNom(c: Convocation): string {
  return `${c.prenom ?? ""} ${c.nom ?? ""}`.trim() || "—";
}

function concoursLabel(c: Convocation): string {
  if (!c.nomConcours && !c.numeroConcours) return "—";
  if (c.numeroConcours) {
    return `${c.nomConcours || "—"} (${c.numeroConcours})`;
  }
  return c.nomConcours || "—";
}

function placeLabel(c: Convocation): string {
  return c.numeroPlace != null ? `N° ${c.numeroPlace}` : "—";
}

function emailLabel(c: Convocation): string {
  return c.email && c.email.trim() !== "" ? c.email : "manquant";
}

function convocationRows(
  convocations: Convocation[],
  formatDateHeure: (iso: string | null) => string,
): string[][] {
  return convocations.map((c) => [
    cell(candidatNom(c)),
    cell(c.numeroInscription),
    cell(concoursLabel(c)),
    cell(c.nomCentre),
    cell(c.nomEtablissement),
    cell(c.nomSalle),
    cell(formatDateHeure(c.dateHeureExamen)),
    cell(placeLabel(c)),
    cell(emailLabel(c)),
  ]);
}

function convocationRowsPdf(
  convocations: Convocation[],
  formatDateHeure: (iso: string | null) => string,
): string[][] {
  return convocations.map((c) => [
    pdfCell(candidatNom(c)),
    pdfCell(c.numeroInscription),
    pdfCell(concoursLabel(c)),
    pdfCell(c.nomCentre),
    pdfCell(c.nomEtablissement),
    pdfCell(c.nomSalle),
    pdfCell(formatDateHeure(c.dateHeureExamen)),
    pdfCell(placeLabel(c)),
    pdfCell(emailLabel(c)),
  ]);
}

function buildFilename(ctx: ConvocationsExportContext, ext: "pdf" | "docx"): string {
  const scope = ctx.filterDescription ? "filtre" : "complet";
  return `convocations-${scope}.${ext}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function metadataLines(ctx: ConvocationsExportContext): string[] {
  const lines = [
    `Exporté le ${ctx.exportedAt}`,
    `Périmètre : ${ctx.scopeLabel} (${ctx.convocations.length} convocation${ctx.convocations.length > 1 ? "s" : ""})`,
    `Total disponible : ${ctx.totalCount} convocation${ctx.totalCount > 1 ? "s" : ""}`,
  ];
  if (ctx.filterDescription) {
    lines.push(`Filtres : ${ctx.filterDescription}`);
  }
  return lines;
}

export async function exportConvocationsPdf(ctx: ConvocationsExportContext): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  let y = 14;

  doc.setFontSize(14);
  doc.text(toPdfText("Liste des convocations"), 14, y);
  y += 8;

  doc.setFontSize(9);
  for (const line of metadataLines(ctx)) {
    doc.text(toPdfText(line), 14, y);
    y += 5;
  }

  autoTable(doc, {
    head: [HEADERS.map((h) => toPdfText(h))],
    body: convocationRowsPdf(ctx.convocations, ctx.formatDateHeure),
    startY: y + 2,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    margin: { left: 10, right: 10 },
  });

  doc.save(buildFilename(ctx, "pdf"));
}

export async function exportConvocationsDocx(ctx: ConvocationsExportContext): Promise<void> {
  const metaParagraphs = metadataLines(ctx).map(
    (line) =>
      new Paragraph({
        children: [new TextRun({ text: line, size: 20 })],
        spacing: { after: 120 },
      }),
  );

  const headerRow = new TableRow({
    children: HEADERS.map(
      (header) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: header, bold: true, size: 16 })],
            }),
          ],
          shading: { fill: "2563EB" },
        }),
    ),
  });

  const dataRows = ctx.convocations.map(
    (c) =>
      new TableRow({
        children: convocationRows([c], ctx.formatDateHeure)[0].map(
          (value) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: value, size: 16 })] })],
            }),
        ),
      }),
  );

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });

  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: "Liste des convocations",
            heading: HeadingLevel.HEADING_1,
          }),
          ...metaParagraphs,
          new Paragraph({ text: "" }),
          table,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(document);
  downloadBlob(blob, buildFilename(ctx, "docx"));
}
