import { createElement } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  a({ node, href, children, ...props }) {
    void node;
    const external = Boolean(href && /^(https?:)?\/\//i.test(href));
    return createElement("a", {
      ...props,
      href,
      ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}),
    }, children);
  },
  table({ node, children, ...props }) {
    void node;
    return createElement("div", { className: "chat-markdown-table", role: "region", "aria-label": "Scrollable table", tabIndex: 0 },
      createElement("table", props, children));
  },
};

export function AssistantMarkdown({ content }: { content: string }) {
  return createElement("div", { className: "chat-markdown" },
    createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm, remarkBreaks],
      components: markdownComponents,
    }, content));
}
