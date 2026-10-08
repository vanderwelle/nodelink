/**
 * NodeKit steps used on /start-node and /setup. Every command and key below is taken from the
 * official docs linked in NODEKIT_SOURCES (checked 2026-10-08). Update both together.
 */
export const NODEKIT_SOURCES = {
  site: { label: "nodekit.run", url: "https://nodekit.run" },
  quickStart: { label: "NodeKit Quick Start — dev.algorand.co", url: "https://dev.algorand.co/nodes/nodekit-quick-start/" },
  overview: { label: "NodeKit Overview — dev.algorand.co", url: "https://dev.algorand.co/nodes/nodekit-overview/" },
  repo: { label: "algorandfoundation/nodekit (GitHub)", url: "https://github.com/algorandfoundation/nodekit" },
  catchup: { label: "nodekit catchup (reference)", url: "https://github.com/algorandfoundation/nodekit/blob/main/man/nodekit_catchup.md" },
  upgrade: { label: "nodekit upgrade (reference)", url: "https://github.com/algorandfoundation/nodekit/blob/main/man/nodekit_upgrade.md" },
  startStop: { label: "nodekit start / stop (reference)", url: "https://github.com/algorandfoundation/nodekit/blob/main/man/nodekit_start.md" },
  hardware: { label: "Validator hardware requirements — dev.algorand.co", url: "https://dev.algorand.co/nodes/types/#hardware-requirements" },
} as const;

export type NodekitSource = keyof typeof NODEKIT_SOURCES;

export const NODEKIT_INSTALL = {
  linux: "wget -qO- https://nodekit.run/install.sh | bash",
  macos: "curl -fsSL https://nodekit.run/install.sh | bash",
} as const;

export const NODEKIT_CMD = {
  bootstrap: "./nodekit bootstrap",
  open: "./nodekit",
  openNoIncentives: "./nodekit -n",
  catchup: "./nodekit catchup",
  upgrade: "./nodekit upgrade",
  start: "./nodekit start",
  stop: "./nodekit stop",
} as const;
