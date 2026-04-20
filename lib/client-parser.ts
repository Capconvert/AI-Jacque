export function extractClientName(question: string): string | null {
  // Match company names with business suffixes like "Acme Corp", "ABC Inc"
  const companySuffixPattern = /\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*)\s+(Corp|Inc|LLC|Ltd|Co(?:\.|p)?|Company|Group|Holdings|Corporation|Industries|Solutions|Media|Technologies|Services|Agency|Partners|Ventures|Consulting|Global|International)\b/;

  const match = question.match(companySuffixPattern);
  if (match) {
    return (match[1] + ' ' + match[2]).trim();
  }

  // Fallback: Look for capitalized multi-word phrases that might be company names
  // This handles names like "Clean Eatz Kitchen", "Bark Potty", etc.
  const multiwordPattern = /\b([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)+)\b/;
  const multiwordMatch = question.match(multiwordPattern);
  if (multiwordMatch) {
    let potentialName = multiwordMatch[1].trim();
    // Filter out leading prepositions/common words
    potentialName = potentialName.replace(/^(What|When|Where|Why|How|Tell|For|About|Regarding|The|This|That)\s+/i, '').trim();
    if (potentialName.length > 1) {
      return potentialName;
    }
  }

  return null;
}
