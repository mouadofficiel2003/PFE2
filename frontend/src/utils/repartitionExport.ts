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
import type { AffectationDto } from "../api/repartitionApi";

export type RepartitionExportContext = {
  runId: number;
  statutLabel: string;
  declenchePar: string;
  demarreLe: string;
  termineLe: string;
  totalCandidats: number;
  totalAffectes: number;
  totalAlertes: number;
  message: string | null;
  affectations: AffectationDto[];
  scopeLabel: string;
  filterDescription: string | null;
};

const HEADERS = [
  "Candidat",
  "Ville",
  "Concours",
  "Centre",
  "Établissement",
  "Salle",
  "Place",
] as const;

function cell(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return String(value);
}

/** jsPDF default font only supports WinAnsi; strip/replace Unicode that breaks rendering. */
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

function affectationRows(affectations: AffectationDto[]): string[][] {
  return affectations.map((af) => [
    cell(af.candidatNom),
    cell(af.ville),
    cell(af.nomConcours),
    cell(af.nomCentre),
    cell(af.nomEtablissement),
    cell(af.nomSalle),
    cell(af.numeroPlace),
  ]);
}

function affectationRowsPdf(affectations: AffectationDto[]): string[][] {
  return affectations.map((af) => [
    pdfCell(af.candidatNom),
    pdfCell(af.ville),
    pdfCell(af.nomConcours),
    pdfCell(af.nomCentre),
    pdfCell(af.nomEtablissement),
    pdfCell(af.nomSalle),
    pdfCell(af.numeroPlace),
  ]);
}

function buildFilename(ctx: RepartitionExportContext, ext: "pdf" | "docx"): string {
  const scope = ctx.filterDescription ? "filtre" : "complet";
  return `repartition-${ctx.runId}-${scope}.${ext}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function metadataLines(ctx: RepartitionExportContext): string[] {
  const lines = [
    `Exécution #${ctx.runId} · ${ctx.statutLabel}`,
    `Déclenché par ${ctx.declenchePar}`,
    `Période : ${ctx.demarreLe} → ${ctx.termineLe}`,
    `Candidats : ${ctx.totalCandidats} · Affectés : ${ctx.totalAffectes} · Alertes : ${ctx.totalAlertes}`,
    `Périmètre export : ${ctx.scopeLabel} (${ctx.affectations.length} ligne${ctx.affectations.length > 1 ? "s" : ""})`,
  ];
  if (ctx.filterDescription) {
    lines.push(`Filtres : ${ctx.filterDescription}`);
  }
  if (ctx.message) {
    lines.push(`Message : ${ctx.message}`);
  }
  return lines;
}

export async function exportRepartitionPdf(ctx: RepartitionExportContext): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  let y = 14;

  doc.setFontSize(14);
  doc.text(toPdfText(`Synthèse de répartition #${ctx.runId}`), 14, y);
  y += 8;

  doc.setFontSize(9);
  for (const line of metadataLines(ctx)) {
    doc.text(toPdfText(line), 14, y);
    y += 5;
  }

  autoTable(doc, {
    head: [HEADERS.map((h) => toPdfText(h))],
    body: affectationRowsPdf(ctx.affectations),
    startY: y + 2,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    margin: { left: 14, right: 14 },
  });

  doc.save(buildFilename(ctx, "pdf"));
}

export async function exportRepartitionDocx(ctx: RepartitionExportContext): Promise<void> {
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
              children: [new TextRun({ text: header, bold: true, size: 18 })],
            }),
          ],
          shading: { fill: "2563EB" },
        }),
    ),
  });

  const dataRows = ctx.affectations.map(
    (af) =>
      new TableRow({
        children: affectationRows([af])[0].map(
          (value) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: value, size: 18 })] })],
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
            text: `Synthèse de répartition #${ctx.runId}`,
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
