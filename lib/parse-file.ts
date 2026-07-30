import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedRow {
  [key: string]: string;
}

export interface ParsedFile {
  headers: string[];
  rows: ParsedRow[];
}

export function parseCSV(content: string): ParsedFile {
  const result = Papa.parse<ParsedRow>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = result.meta.fields || [];
  const rows = result.data.filter((r) =>
    Object.values(r).some((v) => v !== null && v !== undefined && v.toString().trim() !== ''),
  );

  return { headers, rows };
}

export function parseExcel(buffer: Buffer): ParsedFile {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  if (json.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = Object.keys(json[0]).map((h) => h.trim());
  const rows = json.map((row) => {
    const normalized: ParsedRow = {};
    for (const key of Object.keys(row)) {
      normalized[key.trim()] = row[key]?.toString().trim() || '';
    }
    return normalized;
  });

  return { headers, rows };
}

export function parseFile(filename: string, content: Buffer | string): ParsedFile {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'csv' || ext === 'txt') {
    return parseCSV(content.toString());
  }
  if (ext === 'xlsx' || ext === 'xls') {
    return parseExcel(content as Buffer);
  }
  throw new Error(`Unsupported file type: .${ext}`);
}
