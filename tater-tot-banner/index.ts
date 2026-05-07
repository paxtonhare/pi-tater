/**
 * Tater Tot Banner Extension
 *
 * Replaces pi's startup header with a transparent ANSI Tater Tot banner.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const BANNER_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "taterjudging_ansi_nobg_v2.ansi",
);

const ANSI_PATTERN =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

function withoutAnsi(text: string) {
  return text.replace(ANSI_PATTERN, "");
}

function visibleLength(text: string) {
  return [...withoutAnsi(text)].length;
}

function truncateAnsiToWidth(text: string, width: number) {
  if (width <= 0) return "";

  let output = "";
  let columns = 0;
  let index = 0;

  while (index < text.length && columns < width) {
    ANSI_PATTERN.lastIndex = index;
    const escape = ANSI_PATTERN.exec(text);
    if (escape && escape.index === index) {
      output += escape[0];
      index = ANSI_PATTERN.lastIndex;
      continue;
    }

    const char = Array.from(text.slice(index))[0];
    if (!char) break;
    output += char;
    columns += 1;
    index += char.length;
  }

  return `${output}${RESET}`;
}

function centerAnsi(text: string, width: number) {
  const safeText = truncateAnsiToWidth(text, width);
  const length = visibleLength(safeText);
  if (length >= width) return safeText;
  return `${" ".repeat(Math.floor((width - length) / 2))}${safeText}`;
}

function projectName() {
  return path.basename(process.cwd()) || "session";
}

function loadBanner(): string[] {
  try {
    return fs
      .readFileSync(BANNER_PATH, "utf-8")
      .split("\n")
      .filter((line) => line.length > 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [`Tater Tot banner failed to load: ${message}`];
  }
}

function subtitle(modelId: string) {
  return `${BOLD}Tater Tot${RESET} ${DIM}is judging ${projectName()} · ${modelId}${RESET}`;
}

export default function (pi: ExtensionAPI) {
  const banner = loadBanner();
  let currentModelId = "no model selected";
  let requestRender: (() => void) | undefined;

  function renderHeader(width: number) {
    return [
      "",
      ...banner.map((line) => centerAnsi(line, width)),
      "",
      centerAnsi(subtitle(currentModelId), width),
      "",
    ];
  }

  function installHeader(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;

    ctx.ui.setHeader((tui) => {
      requestRender = () => tui.requestRender();
      return {
        render(width: number) {
          return renderHeader(width);
        },
        invalidate() {
          tui.requestRender();
        },
      };
    });
  }

  function restoreBuiltinHeader(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;
    ctx.ui.setHeader(undefined);
    requestRender = undefined;
  }

  pi.on("session_start", (_event, ctx) => {
    currentModelId = ctx.model?.id ?? "no model selected";
    installHeader(ctx);
  });

  pi.on("model_select", (event) => {
    currentModelId = event.model.id;
    requestRender?.();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    restoreBuiltinHeader(ctx);
  });

  pi.registerCommand("tater-tot", {
    description: "Enable the Tater Tot startup header",
    handler: async (_args, ctx) => {
      currentModelId = ctx.model?.id ?? currentModelId;
      installHeader(ctx);
      ctx.ui.notify("Tater Tot header enabled", "info");
    },
  });

  pi.registerCommand("tater-tot-builtin", {
    description: "Restore pi's built-in startup header for this session",
    handler: async (_args, ctx) => {
      restoreBuiltinHeader(ctx);
      ctx.ui.notify("Built-in header restored", "info");
    },
  });
}
