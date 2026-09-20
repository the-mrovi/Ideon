import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantMarkdown } from "../components/chat/assistant-markdown.ts";

const exactResponse = [
  "## Research Directions",
  "",
  "Here are some possible directions:",
  "",
  "1. **Pedagogical Impact:** How automated AI feedback systems affect student self-efficacy and learning retention compared with traditional instructor feedback.",
  "",
  "2. **Faculty Roles & Workload:** How automating routine course administration changes instructors' time allocation and teaching strategies.",
  "",
  "3. **Institutional Policy & Ethics:** How universities balance automated grading and surveillance tools with student privacy and fairness.",
  "",
  "4. **Curriculum Adaptation:** How fields affected by AI automation change their university curricula.",
  "",
  "### Possible Factors",
  "",
  "- Student engagement",
  "- Learning performance",
  "- AI literacy",
  "- Academic integrity",
  "  - AI-assisted writing",
  "  - Plagiarism",
  "  - Responsible use",
  "",
  "### Possible Research Question",
  "",
  "**How does the use of generative AI affect university students' learning experience?**",
  "",
  "> AI should support the student's research process while keeping the student involved in the decisions.",
  "",
  "Example variable:",
  "",
  "`student_engagement`",
  "",
  "Example:",
  "",
  "```python",
  "engagement_score = 85",
  "print(engagement_score)",
  "```",
  "",
  "| Variable | Type |",
  "|---|---|",
  "| AI Usage | Independent |",
  "| Engagement | Dependent |",
  "| Academic Performance | Dependent |",
  "",
  "### Research Process",
  "",
  "- [x] Select topic",
  "- [x] Identify research area",
  "- [ ] Write research question",
  "- [ ] Literature review",
  "- [ ] Data collection",
  "",
  "[Example Research Source](https://example.com)",
  "",
  "---",
].join("\n");

function render(content) {
  return renderToStaticMarkup(createElement(AssistantMarkdown, { content }));
}

test("renders the complete Ideon Markdown fixture", () => {
  const html = render(exactResponse);
  assert.match(html, /<h2>Research Directions<\/h2>/);
  assert.match(html, /<ol>/);
  assert.match(html, /<strong>Pedagogical Impact:<\/strong>/);
  assert.match(html, /<ul>[\s\S]*<ul>/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<code>student_engagement<\/code>/);
  assert.match(html, /<pre><code class="language-python">/);
  assert.match(html, /class="chat-markdown-table"/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /<hr\/>/);
  assert.doesNotMatch(html, /\*\*Pedagogical/);
  assert.doesNotMatch(html, /- \[ \]/);
});

test("renders emphasis, strikethrough, soft breaks, and incomplete streaming Markdown safely", () => {
  const html = render("*Italic* and ***bold italic*** and ~~old~~\nNext line");
  assert.match(html, /<em>Italic<\/em>/);
  assert.match(html, /<em><strong>bold italic<\/strong><\/em>/);
  assert.match(html, /<del>old<\/del>/);
  assert.match(html, /<br\/>\nNext line/);
  assert.doesNotThrow(() => render("**Pedagogical"));
});

test("does not execute or render raw HTML", () => {
  const html = render('<script>alert("test")</script><img src=x onerror="alert(1)">');
  assert.doesNotMatch(html, /<script|<img/i);
  assert.match(html, /&lt;script&gt;/);
});
