export function pageTitle(page, language) {
  return page.titleTranslations?.[language] || page.title;
}
