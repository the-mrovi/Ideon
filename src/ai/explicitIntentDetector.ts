import type { ActiveStrategy } from "./decisionTypes.ts";

const EXPLORE_COMMANDS = [
  /\b(give|show|suggest|offer)\s+(me\s+)?(some\s+|a few\s+|more\s+)?(other|different|alternative)\s+(ideas?|directions?|topics?|options?)\b/i,
  /\b(what else|other ideas?|different directions?|change (the )?topic|try something different|look at alternatives?)\b/i,
  /\b(let'?s|can we|i want to)\s+(switch|change|explore|consider)\b.*\b(direction|topic|ideas?|options?)\b/i,
];

const DEEPEN_COMMANDS = [
  /\b(go|dig)\s+deeper\b/i,
  /\b(tell|show)\s+me\s+more\b/i,
  /\b(develop|expand|refine|narrow)\s+(this|that|the|idea|topic|direction|question)/i,
  /\b(let'?s|i want to|can we)\s+(continue|work|focus|build)\b.*\b(this|that|idea|topic|direction|one|number\s*\d+)\b/i,
];

export interface ExplicitIntentResult {
  strategy: ActiveStrategy | null;
  matchedPhrase?: string;
}

export function detectExplicitIntent(message: string): ExplicitIntentResult {
  for (const pattern of EXPLORE_COMMANDS) {
    const match = message.match(pattern);
    if (match) return { strategy: "explore", matchedPhrase: match[0] };
  }
  for (const pattern of DEEPEN_COMMANDS) {
    const match = message.match(pattern);
    if (match) return { strategy: "deepen", matchedPhrase: match[0] };
  }
  return { strategy: null };
}
