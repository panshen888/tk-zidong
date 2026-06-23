export type ParsedTikTokProductUrl = {
  productId: string;
  country: string;
};

export function parseTikTokProductUrl(rawUrl: string): ParsedTikTokProductUrl {
  const text = rawUrl.trim().replace(/\u200b/g, '');
  if (!text) {
    return { productId: '', country: '' };
  }

  const productId = text.match(/\/(?:view\/)?product\/(\d+)/i)?.[1] ?? text.match(/\b(\d{10,})\b/)?.[1] ?? '';

  let country = text.match(/[?&]region=([^&#\s]+)/i)?.[1] ?? '';
  country ||= text.match(/\/shop\/([a-z]{2})\/pdp\//i)?.[1] ?? '';
  if (!country) {
    try {
      const url = new URL(text);
      country = url.searchParams.get('region') ?? url.pathname.match(/\/shop\/([a-z]{2})\/pdp\//i)?.[1] ?? '';
    } catch {
      country = '';
    }
  }

  return {
    productId,
    country: country.trim(),
  };
}
