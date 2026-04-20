export function extractClientName(question: string): string | null {
  // Look for patterns like "for ClientName", "ClientName's", "about ClientName"
  const patterns = [
    /(?:for|about|regarding)\s+([A-Z][a-zA-Z\s&]+?)(?:\s*\?|$|\.|,)/i,
    /([A-Z][a-zA-Z\s&]+?)(?:'s|')\s+/i,
    /^([A-Z][a-zA-Z\s&]+?)\s+/i,
  ];

  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}
