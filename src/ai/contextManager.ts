import type { IdeationContext, StateAnalysisResult } from "./decisionTypes.ts";

const selectionPatterns = [
  /\b(i want|choose|pick|use)\s+(number|option|idea)\s*(\d+)\b/i,
  /\b(let'?s use|go with|continue with|focus on)\s+(.+)/i,
  /\b(this is the one|this will be my topic)\b/i,
  /\b(i like|sounds interesting|seems interesting|this interests me)\b/i,
];
const rejectionPatterns = [/\bi don'?t like\b/i, /\bi don'?t want (this|that)\b/i, /\bnot this (one|direction|topic)\b/i, /\btry something different\b/i, /\btoo (common|broad|narrow|obvious)\b/i, /\bchange (the )?(topic|direction)\b/i];
const constraintPatterns = [/\b(undergraduate|postgraduate|graduate|university|college|faculty|teacher|student)s?\b/i, /\b(qualitative|quantitative|mixed[- ]methods?|survey|interview|experiment)\b/i, /\b(within|over|during)\s+\d+\s+(days?|weeks?|months?|years?)\b/i, /\b(limited|small|no)\s+(budget|funding|time|data|access)\b/i, /\b(in|from|within)\s+[A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){0,2}\b/];

function cleanDirection(message: string) {
  return message.trim().replace(/\s+/g, " ").slice(0, 300);
}

export function createIdeationContext(originalTopic = "Generative AI in University Education"): IdeationContext {
  return { originalTopic, selectedIdeas: [], rejectedIdeas: [], userGoals: [], userConstraints: [] };
}

export function updateIdeationContext(context: IdeationContext, message: string, analysis?: StateAnalysisResult): IdeationContext {
  const next: IdeationContext = { ...context, selectedIdeas: [...context.selectedIdeas], rejectedIdeas: [...context.rejectedIdeas], userGoals: [...(context.userGoals ?? [])], userConstraints: [...(context.userConstraints ?? [])] };
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
  if (constraintPatterns.some((pattern) => pattern.test(message))) {
    const constraint = cleanDirection(message);
    if (!next.userConstraints?.includes(constraint)) next.userConstraints?.push(constraint);
  }
  return next;
}
