import { catalogLabel, catalogValue, catalogValues } from '../../shared/catalogs';

export default function CatalogSelect({
  field,
  value,
  dataset = 'cases',
  label,
  onChange,
  t,
  className,
}) {
  const normalized = catalogValue(field, value, dataset);
  return (
    <select
      className={className || 'catalog-select'}
      aria-label={label}
      value={normalized === null ? value : normalized}
      title={value && value !== normalized ? t('catalogSource', { value }) : undefined}
      onChange={(event) => onChange(event.target.value)}
    >
      {field !== 'itemType' && field !== 'priority' && (
        <option value="">{t('catalogUnspecified')}</option>
      )}
      {normalized === null && (
        <option value={value}>{catalogLabel(field, value, dataset, t)}</option>
      )}
      {catalogValues(field, dataset).map((option) => (
        <option key={option} value={option}>
          {catalogLabel(field, option, dataset, t)}
        </option>
      ))}
    </select>
  );
}
