const terms = [
  ['Resumen QA', 'QA summary'],
  ['Casos de prueba', 'Test cases'],
  ['Casos QA', 'QA cases'],
  ['Bugs', 'Bugs'],
  ['Bugs Azure', 'Azure bugs'],
  ['Notas', 'Notes'],
  ['Recordatorios', 'Reminders'],
  ['Mecanica Promocional', 'Promotional mechanics'],
  ['Espacio Promocional', 'Promotional space'],
  ['Precios Camión', 'Truck prices'],
  ['Reporte de bugs', 'Bug report'],
];
const decode = (text) =>
  text.replace(/&(?:amp|quot|apos|lt|gt|#39|#\d+|#x[\da-f]+);/gi, (entity) => {
    const names = {
      '&amp;': '&',
      '&quot;': '"',
      '&apos;': "'",
      '&#39;': "'",
      '&lt;': '<',
      '&gt;': '>',
    };
    if (names[entity.toLowerCase()]) return names[entity.toLowerCase()];
    const hex = entity.toLowerCase().startsWith('&#x');
    const value = parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
  });

export async function translateTitle(title, from, to, fetcher = fetch) {
  if (from === to) return title;
  const known = terms.find(
    (pair) => pair[from === 'es' ? 0 : 1].toLocaleLowerCase() === title.toLocaleLowerCase(),
  );
  if (known) return known[to === 'es' ? 0 : 1];
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', title);
  url.searchParams.set('langpair', `${from}|${to}`);
  const response = await fetcher(url, { signal: AbortSignal.timeout(8000), redirect: 'error' });
  if (!response.ok) throw new Error('TRANSLATION_UNAVAILABLE');
  const data = await response.json();
  const result = data.responseData?.translatedText;
  if (
    Number(data.responseStatus) !== 200 ||
    data.quotaFinished ||
    typeof result !== 'string' ||
    !result.trim() ||
    result.length > 1000
  )
    throw new Error('TRANSLATION_UNAVAILABLE');
  const translated = decode(result).trim();
  if (translated.length > 120) throw new Error('TRANSLATION_UNAVAILABLE');
  return translated;
}
