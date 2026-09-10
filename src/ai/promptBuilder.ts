import type { ChatMessage } from "../../types/study.ts";
import type { ActiveStrategy, IdeationContext } from "./decisionTypes.ts";
import { COMMON_IDEON_INSTRUCTIONS, COMMON_PROMPT_VERSION } from "./prompts/common.ts";
import { EXPLORE_INSTRUCTIONS, EXPLORE_PROMPT_VERSION } from "./prompts/explore.ts";
import { DEEPEN_INSTRUCTIONS, DEEPEN_PROMPT_VERSION } from "./prompts/deepen.ts";

export interface BuiltPrompt { instructions: string; input: Array<{ role: "user" | "assistant"; content: string }>; promptVersion: string }

export function buildPrompt(strategy: ActiveStrategy, message: string, recentMessages: ChatMessage[], context: IdeationContext): BuiltPrompt {
  const strategyPrompt = strategy === "explore" ? EXPLORE_INSTRUCTIONS : DEEPEN_INSTRUCTIONS;
  const strategyVersion = strategy === "explore" ? EXPLORE_PROMPT_VERSION : DEEPEN_PROMPT_VERSION;
  const contextSummary = [
    `Original topic: ${context.originalTopic ?? "Not set"}.`,
    context.currentDirection ? `Current participant-selected direction: ${context.currentDirection}.` : "No direction has been firmly selected.",
    context.rejectedIdeas.length ? `Do not repeat these rejected directions: ${context.rejectedIdeas.slice(-4).join(" | ")}.` : "No rejected directions are recorded.",
  ].join("\n");
  const history = recentMessages.slice(-8).filter((item) => item.status !== "failed" && item.status !== "thinking").map((item) => ({ role: item.role, content: item.content }));
  return { instructions: `${COMMON_IDEON_INSTRUCTIONS}\n\n${strategyPrompt}\n\nSession context:\n${contextSummary}`, input: [...history, { role: "user", content: message }], promptVersion: `${COMMON_PROMPT_VERSION}+${strategyVersion}` };
}
