import type { IdeationContext, StateAnalysisResult } from "./decisionTypes.ts";

const selectionPatterns = [
  /\b(i want|choose|pick|use)\s+(number|option|idea)\s*(\d+)\b/i,
  /\b(let'?s use|go with|continue with|focus on)\s+(.+)/i,
  /\b(this is the one|this will be my topic)\b/i,
];
const rejectionPatterns = [/\bi don'?t like\b/i, /\bnot this one\b/i, /\btry something different\b/i, /\btoo common\b/i, /\bchange (the )?(topic|direction)\b/i];

function cleanDirection(message: string) {
  return message.trim().replace(/\s+/g, " ").slice(0, 300);
}

export function createIdeationContext(originalTopic = "Generative AI in University Education"): IdeationContext {
  return { originalTopic, selectedIdeas: [], rejectedIdeas: [], userGoals: [] };
}

export function updateIdeationContext(context: IdeationContext, message: string, analysis?: StateAnalysisResult): IdeationContext {
  const next: IdeationContext = { ...context, selectedIdeas: [...context.selectedIdeas], rejectedIdeas: [...context.rejectedIdeas], userGoals: [...(context.userGoals ?? [])] };
  const selected = selectionPatterns.some((pattern) => pattern.test(message)) || analysis?.state === "committed";
  const rejected = rejectionPatterns.some((pattern) => pattern.test(message)) || analysis?.state === "rejecting";
  if (rejected && next.currentDirection) {
    if (!next.rejectedIdeas.includes(next.currentDirection)) next.rejectedIdeas.push(next.currentDirection);
    next.currentDirection = undefined;
  }
  if (selected) {
    const direction = cleanDirection(message);
    next.currentDirection = direction;
    if (!next.selectedIdeas.includes(direction)) next.selectedIdeas.push(direction);
  }
  return next;
}
