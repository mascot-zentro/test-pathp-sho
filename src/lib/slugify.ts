/** Turns a product name into a URL-safe slug, e.g. "Men's Linen Shirt" -> "mens-linen-shirt" */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "product";
}
