import { qaStatuses } from './qa.js';

export const qaClassifications = [
  'functional',
  'code',
  'data',
  'code_data',
  'code_data_contract',
  'contract_automation',
  'automation',
  'environment',
  'rule',
  'no_defect',
  'not_applicable',
  'pending',
];
export const automationStates = [
  'to_review',
  'not_automated',
  'operational',
  'needs_adjustment',
  'in_progress',
  'fixed',
  'validated',
  'completed',
  'not_applicable',
];
export const workAreas = [
  'analysis',
  'frontend',
  'backend',
  'fullstack',
  'testing',
  'documentation',
  'infrastructure',
  'research',
];
export const workTypes = ['story', 'feature', 'task', 'bug', 'spike'];
export const workStatuses = ['todo', 'progress', 'blocked', 'done'];
export function catalogValues(field, dataset = 'cases') {
  if (field === 'status') return dataset === 'tasks' ? workStatuses : qaStatuses;
  if (field === 'classification') return dataset === 'tasks' ? workAreas : qaClassifications;
  if (field === 'automation') return dataset === 'tasks' ? [] : automationStates;
  if (field === 'itemType') return workTypes;
  if (field === 'priority') return ['low', 'medium', 'high'];
  return [];
}
const aliases = {
  classification: {
    FUNCTIONAL: 'functional',
    FUNCIONAL: 'functional',
    CODE: 'code',
    DATOS: 'data',
    'CODE/DATA': 'code_data',
    'DATA/CODE': 'code_data',
    'CODE/DATA/CONTRACT': 'code_data_contract',
    'CONTRACT / AUTOMATION': 'contract_automation',
    AUTOMATIZACIÓN: 'automation',
    AMBIENTE: 'environment',
    'REGLA / CONTRATO': 'rule',
    'SIN DEFECTO': 'no_defect',
    'NO APLICA': 'not_applicable',
    PENDIENTE: 'pending',
    'POR REVISAR': 'pending',
    'POR DETERMINAR': 'pending',
  },
  automation: {
    CORREGIDA: 'fixed',
    OPERATIVA: 'operational',
    'EN AJUSTE': 'in_progress',
    'PENDIENTE REVISAR': 'to_review',
    'POR REVISAR': 'to_review',
    'POR AJUSTAR': 'needs_adjustment',
    'NO AUTOMATIZADO': 'not_automated',
    'NO APLICA': 'not_applicable',
    'N/A': 'not_applicable',
    TERMINADO: 'completed',
    '15/15 PASS': 'validated',
  },
};
export function catalogValue(field, value = '', dataset = 'cases') {
  if (!value) return '';
  if (catalogValues(field, dataset).includes(value)) return value;
  if (dataset !== 'tasks' && aliases[field]?.[value.trim().toUpperCase()])
    return aliases[field][value.trim().toUpperCase()];
  return null;
}
export function catalogLabel(field, value, dataset, t) {
  const normalized = catalogValue(field, value, dataset);
  if (normalized === '') return t('catalogUnspecified');
  if (normalized === null) return t('catalogOriginal', { value });
  if (field === 'status' && dataset === 'tasks')
    return t(normalized === 'progress' ? 'inProgress' : normalized);
  if (field === 'status') return normalized;
  if (field === 'priority') return t(normalized);
  return t(`catalogLabels.${normalized}`);
}
export function groupRecords(pages, dataset, field) {
  let records = pages.flatMap((page) =>
    page.blocks
      .filter((block) =>
        dataset === 'tasks'
          ? block.type === 'table'
          : block.type === 'qa' && block.kind === dataset,
      )
      .flatMap((block) => block.rows),
  );
  if (dataset === 'bugs') {
    const seen = new Set();
    records = records.filter((row) => {
      if (!row.workItemId || seen.has(row.workItemId)) return false;
      seen.add(row.workItemId);
      return true;
    });
  }
  const groups = new Map();
  for (const row of records) {
    const value = row[field] || (dataset === 'tasks' && field === 'itemType' ? 'task' : '');
    const normalized = catalogValue(field, value, dataset);
    const key = normalized === null ? `original:${value}` : normalized;
    const group = groups.get(key) || { key, value, count: 0 };
    group.count++;
    groups.set(key, group);
  }
  return {
    total: records.length,
    groups: [...groups.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
  };
}

export function validQACatalogEdits(blocks, previous = []) {
  const oldRows = new Map(
    previous
      .filter((block) => block.type === 'qa')
      .flatMap((block) => block.rows.map((row) => [row.id, row])),
  );
  return blocks
    .filter((block) => block.type === 'qa')
    .every((block) =>
      block.rows.every((row) =>
        ['classification', 'automation'].every(
          (field) =>
            !row[field] ||
            catalogValues(field).includes(row[field]) ||
            oldRows.get(row.id)?.[field] === row[field],
        ),
      ),
    );
}
