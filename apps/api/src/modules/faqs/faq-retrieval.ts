const commonWords = new Set(
  'the a an of is are to for and it can i my me how what where when which do does please ازاي كيف اين متي اي ما هل في من علي عن ممكن انا لو ده دي بتاع اعرف'.split(
    ' ',
  ),
);

export function normalizeFaqText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\p{Mark}|\u0640/gu, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function faqTerms(value: string): string[] {
  return [...new Set(normalizeFaqText(value).split(' '))]
    .filter((term) => term.length > 1 && !commonWords.has(term))
    .slice(0, 12);
}

export function faqTermPattern(term: string): string {
  return term.replace(/[ايه]/g, (letter) =>
    letter === 'ا' ? '[اأإآٱ]' : letter === 'ي' ? '[يى]' : '[هة]',
  );
}

export function scoreFaq(
  query: string,
  terms: string[],
  faq: { question: string; topics?: string[]; keywords?: string[] },
): number {
  if (!terms.length) return 0;
  if (normalizeFaqText(faq.question) === normalizeFaqText(query)) return 100;
  const question = new Set(faqTerms(faq.question));
  const topics = new Set(faq.topics?.flatMap(faqTerms));
  const keywords = new Set(faq.keywords?.flatMap(faqTerms));
  return terms.reduce((total, term) => {
    const variants = term.startsWith('ال')
      ? [term, term.slice(2)]
      : [term, `ال${term}`];
    if (variants.some((part) => question.has(part))) return total + 4;
    if (variants.some((part) => keywords.has(part))) return total + 3;
    if (variants.some((part) => topics.has(part))) return total + 2;
    return total;
  }, 0);
}
