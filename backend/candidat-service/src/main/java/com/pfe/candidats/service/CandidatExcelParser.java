package com.pfe.candidats.service;

import java.io.IOException;
import java.io.InputStream;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;

/**
 * Lit un fichier .xlsx : détecte la ligne d'en-têtes (titres en haut du fichier acceptés)
 * ou, à défaut, ordre fixe colonnes A–J.
 */
final class CandidatExcelParser {

    private static final DataFormatter DATA_FORMATTER = new DataFormatter();
    /** Nombre max de lignes parcourues pour trouver la ligne d'en-têtes. */
    private static final int MAX_HEADER_SCAN_ROWS = 100;

    private CandidatExcelParser() {}

    static List<SheetRow> parseAll(InputStream in) throws IOException {
        List<SheetRow> out = new ArrayList<>();
        try (Workbook wb = WorkbookFactory.create(in)) {
            Sheet sheet = wb.getNumberOfSheets() > 0 ? wb.getSheetAt(0) : null;
            if (sheet == null) {
                return out;
            }
            int headerRowIdx = findHeaderRowIndex(sheet);
            ParsedSheet layout;
            int start;
            if (headerRowIdx >= 0) {
                layout = new ParsedSheet(true, buildHeaderMap(sheet.getRow(headerRowIdx)));
                start = headerRowIdx + 1;
            } else {
                layout = new ParsedSheet(false, fixedColumnMap());
                start = 0;
            }
            int last = sheet.getLastRowNum();
            for (int r = start; r <= last; r++) {
                int rowOneBased = r + 1;
                Row row = sheet.getRow(r);
                if (row != null && looksLikeHeaderRow(row)) {
                    continue;
                }
                Optional<ParsedRow> data = readDataRow(row, layout);
                if (data.isEmpty()) {
                    continue;
                }
                out.add(new SheetRow(rowOneBased, data.get()));
            }
        }
        return out;
    }

    /** Cherche la première ligne contenant des libellés de colonnes (CIN, e-mail, etc.). */
    private static int findHeaderRowIndex(Sheet sheet) {
        int last = Math.min(sheet.getLastRowNum(), MAX_HEADER_SCAN_ROWS);
        for (int r = 0; r <= last; r++) {
            Row row = sheet.getRow(r);
            if (row != null && looksLikeHeaderRow(row)) {
                return r;
            }
        }
        return -1;
    }

    record SheetRow(int rowNumber, ParsedRow data) {}

    record ParsedSheet(boolean hasHeader, Map<String, Integer> columnByKey) {}

    record ParsedRow(
            String nom,
            String prenom,
            String cin,
            String numeroTelephone,
            String ville,
            String ageRaw,
            String email,
            String specialite,
            String numeroInscription,
            String nomConcours,
            String numeroConcours) {}

    private static Optional<ParsedRow> readDataRow(Row row, ParsedSheet sheet) {
        if (row == null) {
            return Optional.empty();
        }
        String nom = cell(row, "nom", sheet).trim();
        String prenom = cell(row, "prenom", sheet).trim();
        String cin = cell(row, "cin", sheet).trim();
        if (nom.isEmpty() && prenom.isEmpty() && cin.isEmpty()) {
            return Optional.empty();
        }
        String tel = cell(row, "telephone", sheet).trim();
        String ville = cell(row, "ville", sheet).trim();
        String ageStr = cell(row, "age", sheet).trim();
        String email = cell(row, "email", sheet).trim();
        String specialite = cell(row, "specialite", sheet).trim();
        String numIns = cell(row, "numeroinscription", sheet).trim();
        String nomConcours = cell(row, "nomconcours", sheet).trim();
        String numeroConcours = cell(row, "numeroconcours", sheet).trim();
        return Optional.of(new ParsedRow(
                nom, prenom, cin, tel, ville, ageStr, email, specialite, numIns, nomConcours, numeroConcours));
    }

    private static String cell(Row row, String key, ParsedSheet sheet) {
        Integer idx = sheet.columnByKey().get(key);
        if (idx == null) {
            return "";
        }
        return getCellString(row.getCell(idx));
    }

    private static boolean looksLikeHeaderRow(Row row) {
        if (row == null || row.getFirstCellNum() < 0 || row.getLastCellNum() < 0) {
            return false;
        }
        for (int c = row.getFirstCellNum(); c < row.getLastCellNum(); c++) {
            String n = normHeader(getCellString(row.getCell(c)));
            if ("cin".equals(n)) {
                return true;
            }
        }
        StringBuilder joined = new StringBuilder();
        for (int c = row.getFirstCellNum(); c < row.getLastCellNum(); c++) {
            joined.append(normHeader(getCellString(row.getCell(c)))).append(' ');
        }
        String j = joined.toString();
        return j.contains("email") && j.contains("prenom");
    }

    private static Map<String, Integer> buildHeaderMap(Row headerRow) {
        Map<String, Integer> raw = new HashMap<>();
        if (headerRow == null || headerRow.getFirstCellNum() < 0 || headerRow.getLastCellNum() < 0) {
            return new HashMap<>();
        }
        for (int c = headerRow.getFirstCellNum(); c < headerRow.getLastCellNum(); c++) {
            String label = normHeader(getCellString(headerRow.getCell(c)));
            if (!label.isEmpty()) {
                raw.put(label, c);
            }
        }
        Map<String, Integer> byKey = new HashMap<>();
        putFirst(byKey, "nom", raw, "nom", "name");
        putFirst(byKey, "prenom", raw, "prenom", "firstname", "first");
        putFirst(byKey, "cin", raw, "cin", "cine");
        putFirst(
                byKey,
                "telephone",
                raw,
                "telephone",
                "tel",
                "phone",
                "numerotelephone",
                "numtel",
                "mobile");
        putFirst(byKey, "ville", raw, "ville", "city");
        putFirst(byKey, "age", raw, "age");
        putFirst(byKey, "email", raw, "email", "mail", "courriel");
        putFirst(byKey, "specialite", raw, "specialite", "spec", "filiere");
        putFirst(
                byKey,
                "numeroinscription",
                raw,
                "numeroinscription",
                "numinscription",
                "ninscription",
                "codeinscription");
        putFirst(byKey, "nomconcours", raw, "nomconcours", "concours", "examen");
        // Numéro de concours (clé métier, ex. « CSP-2025 »). On accepte aussi les libellés « ID concours ».
        putFirst(
                byKey,
                "numeroconcours",
                raw,
                "numeroconcours",
                "numconcours",
                "nconcours",
                "noconcours",
                "codeconcours",
                "concoursid",
                "idconcours",
                "concourscode",
                "referenceconcours");
        return byKey;
    }

    private static void putFirst(Map<String, Integer> target, String key, Map<String, Integer> raw, String... aliases) {
        for (String a : aliases) {
            Integer idx = raw.get(a);
            if (idx != null) {
                target.putIfAbsent(key, idx);
                break;
            }
        }
    }

    private static Map<String, Integer> fixedColumnMap() {
        Map<String, Integer> m = new HashMap<>();
        m.put("nom", 0);
        m.put("prenom", 1);
        m.put("cin", 2);
        m.put("telephone", 3);
        m.put("ville", 4);
        m.put("age", 5);
        m.put("email", 6);
        m.put("specialite", 7);
        m.put("numeroinscription", 8);
        m.put("nomconcours", 9);
        m.put("numeroconcours", 10);
        return Map.copyOf(m);
    }

    private static String normHeader(String s) {
        if (s == null) {
            return "";
        }
        String trimmed = s.trim();
        if (trimmed.isEmpty()) {
            return "";
        }
        String nfd = Normalizer.normalize(trimmed, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        return nfd.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "");
    }

    private static String getCellString(Cell cell) {
        if (cell == null || cell.getCellType() == CellType.BLANK) {
            return "";
        }
        CellType type = cell.getCellType();
        if (type == CellType.FORMULA) {
            try {
                type = cell.getCachedFormulaResultType();
            } catch (Exception e) {
                return DATA_FORMATTER.formatCellValue(cell);
            }
        }
        return switch (type) {
            case STRING -> cell.getStringCellValue().trim();
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case NUMERIC -> {
                if (DateUtil.isCellDateFormatted(cell)) {
                    yield DATA_FORMATTER.formatCellValue(cell);
                }
                double v = cell.getNumericCellValue();
                // Entiers Excel (CIN, téléphone, n° inscription) : éviter 1.2345678E7
                if (!Double.isNaN(v) && !Double.isInfinite(v) && v == Math.rint(v) && Math.abs(v) <= 9_007_199_254_740_992L) {
                    yield String.valueOf((long) v);
                }
                yield DATA_FORMATTER.formatCellValue(cell).trim();
            }
            default -> DATA_FORMATTER.formatCellValue(cell).trim();
        };
    }
}
