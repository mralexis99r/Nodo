import { unzipSync, strFromU8 } from 'fflate';
import { matrixPackage } from '../shared/matrix-import.js';

export function readXlsx(bytes, Parser = DOMParser) {
  if (bytes.length > 5000000) throw new Error('CONTENT_TOO_LARGE');
  let size = 0,
    entries = 0;
  const files = unzipSync(bytes, {
    filter(file) {
      if (++entries > 2000 || (size += file.originalSize) > 30000000)
        throw new Error('CONTENT_TOO_LARGE');
      return /^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(
        file.name,
      );
    },
  });
  const xml = (path) => {
    if (!files[path]) throw new Error('INVALID_MATRIX');
    const text = strFromU8(files[path]);
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('INVALID_MATRIX');
    const doc = new Parser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('INVALID_MATRIX');
    return doc;
  };
  const all = (node, name) => Array.from(node.getElementsByTagName(name));
  const shared = files['xl/sharedStrings.xml']
    ? all(xml('xl/sharedStrings.xml'), 'si').map((node) =>
        all(node, 't')
          .map((t) => t.textContent)
          .join(''),
      )
    : [];
  const rel = new Map(
    all(xml('xl/_rels/workbook.xml.rels'), 'Relationship').map((node) => [
      node.getAttribute('Id'),
      node.getAttribute('Target'),
    ]),
  );
  return all(xml('xl/workbook.xml'), 'sheet').map((sheet) => {
    const target = rel.get(sheet.getAttribute('r:id'));
    if (!target || target.includes('..')) throw new Error('INVALID_MATRIX');
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const rows = {};
    for (const row of all(xml(path), 'row')) {
      const cells = {};
      for (const cell of all(row, 'c')) {
        const column = cell.getAttribute('r')?.match(/^[A-Z]+/)?.[0];
        if (!column) continue;
        const raw = cell.getElementsByTagName('v')[0]?.textContent || '';
        const type = cell.getAttribute('t');
        cells[column] = {
          value:
            type === 's'
              ? shared[Number(raw)] || ''
              : type === 'inlineStr'
                ? all(cell, 't')
                    .map((n) => n.textContent)
                    .join('')
                : raw,
          formula: !!all(cell, 'f').length,
        };
      }
      rows[row.getAttribute('r')] = cells;
    }
    return { name: sheet.getAttribute('name'), rows };
  });
}

export async function importXlsx(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return matrixPackage(
    readXlsx(bytes),
    file.name,
    [...digest].map((v) => v.toString(16).padStart(2, '0')).join(''),
  );
}
