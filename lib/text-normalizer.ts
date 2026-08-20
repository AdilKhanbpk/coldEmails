/**
 * Normalizes text by replacing problematic Unicode characters with ASCII equivalents.
 * This prevents encoding issues in email subject lines and bodies.
 */
export function normalizeTextForEmail(text: string): string {
  if (!text) return text;

  let normalized = text;

  // Replace various types of dashes with standard hyphen or double hyphen
  normalized = normalized.replace(/[\u2013\u2014]/g, '--'); // en dash, em dash → --
  normalized = normalized.replace(/[\u2015]/g, '--'); // horizontal bar → --

  // Replace smart quotes with straight quotes
  normalized = normalized.replace(/[\u2018\u2019]/g, "'"); // left/right single quote → '
  normalized = normalized.replace(/[\u201C\u201D]/g, '"'); // left/right double quote → "

  // Replace ellipsis
  normalized = normalized.replace(/\u2026/g, '...'); // ellipsis → ...

  // Replace non-breaking space with regular space
  normalized = normalized.replace(/\u00A0/g, ' ');

  // Replace bullet points
  normalized = normalized.replace(/\u2022/g, '*'); // bullet → *

  // Replace other common problematic characters
  normalized = normalized.replace(/\u00AB/g, '<<'); // left guillemet → <<
  normalized = normalized.replace(/\u00BB/g, '>>'); // right guillemet → >>
  normalized = normalized.replace(/\u2039/g, '<'); // single left guillemet → <
  normalized = normalized.replace(/\u203A/g, '>'); // single right guillemet → >

  // Replace degree symbol
  normalized = normalized.replace(/\u00B0/g, ' degrees');

  // Replace trademark, copyright, registered symbols
  normalized = normalized.replace(/\u2122/g, '(TM)'); // trademark
  normalized = normalized.replace(/\u00A9/g, '(c)'); // copyright
  normalized = normalized.replace(/\u00AE/g, '(R)'); // registered

  return normalized;
}
