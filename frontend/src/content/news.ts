import { checkUrl, validateRegistry, type NewsItem } from "./schema";

/** News strip on /community. Newest first is applied automatically. See /CONTENT.md. */
const NEWS_ENTRIES: readonly NewsItem[] = [
  {
    id: "testnet-preview",
    date: "2026-10-08",
    tag: "NodeLink",
    title: "NodeLink preview is live on TestNet",
    body: "Node health, rewards and setup tools for Algorand node runners. Perks and partner programs will appear here as they launch.",
  },
];

export const NEWS: readonly NewsItem[] = [
  ...validateRegistry("news", NEWS_ENTRIES, (n) => [...(Number.isNaN(Date.parse(n.date)) ? [`bad date "${n.date}"`] : []), ...checkUrl(n.url, "url")]),
].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
