export function extractClientName(question: string): string | null {
  // Match company names with business suffixes like "Acme Corp", "ABC Inc"
  const companySuffixPattern = /\b([A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)*)\s+(Corp|Inc|LLC|Ltd|Co(?:\.|p)?|Company|Group|Holdings|Corporation|Industries|Solutions|Media|Technologies|Services|Agency|Partners|Ventures|Consulting|Global|International)\b/;

  const match = question.match(companySuffixPattern);
  if (match) {
    return (match[1] + ' ' + match[2]).trim();
  }

  // Look for capitalized multi-word phrases that might be company names
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

  // Fallback: Look for single capitalized words (like "Homecourt")
  // This matches capitalized words that are typically proper nouns/company names
  const singleWordPattern = /\b([A-Z][a-zA-Z]{2,})\b/;
  const singleWordMatch = question.match(singleWordPattern);
  if (singleWordMatch) {
    let potentialName = singleWordMatch[1];
    // Exclude common question words
    if (!/^(What|When|Where|Why|How|Tell|For|About|Regarding|The|This|That|Can|Could|Would|Should|Is|Are|Do|Does|Did|Will|May|Might|Must|Our|Your|Their|Have|Has|Had)$/.test(potentialName)) {
      return potentialName;
    }
  }

  return null;
}
