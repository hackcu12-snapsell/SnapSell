/** @module constants.js */

// Base URL for your backend API. Override in Vite by setting VITE_API_URL.
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";

/**
 * Returns a display URL for an item image. Scanned/saved items store relative
 * paths (e.g. /uploads/abc.jpg) in the DB; the backend serves them. Seeded data
 * uses full URLs. This prepends API_URL when the value is a relative path so
 * images load correctly from the API origin.
 * @param {string | null | undefined} url - Raw image URL from API (full URL or path like /uploads/...)
 * @returns {string} URL safe to use in <img src={...} />
 */
export function getItemImageUrl(url) {
  if (url == null || typeof url !== "string" || !url.trim()) return "";
  const u = url.trim();
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("/")) return `${API_URL}${u}`;
  return u;
}
