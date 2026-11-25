'use strict';

/** Exportación CSV (UTF-8 con BOM para Excel, separador coma, CRLF). */

/** Neutraliza fórmulas (=, +, -, @, tab, CR) que Excel ejecutaría al abrir el archivo. */
function cell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * @param {{key: string, header: string}[]} columns
 * @param {object[]} rows
 */
function toCsv(columns, rows) {
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

module.exports = { toCsv, cell };
