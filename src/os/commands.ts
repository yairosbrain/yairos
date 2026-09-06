import { APPS, appByCommand } from "./apps";
import type { WmApi } from "./WindowManager";

// The shell in front of the brain. Anything that parses as a known command
// runs locally and costs nothing; everything else falls through to YAIROS.
//
// Deliberately shaped like real shell commands (ls, open, close, clear, help)
// so the muscle memory built here transfers to an actual terminal.

export interface CommandResult {
  handled: boolean;
}

const HELP: [string, string][] = [
  ["help", "cmd.help.help"],
  ["ls", "cmd.help.ls"],
  ["open <app>", "cmd.help.open"],
  ["close <app>", "cmd.help.close"],
  ["dash", "cmd.help.dash"],
  ["startx", "cmd.help.startx"],
  ["tile", "cmd.help.tile"],
  ["clear", "cmd.help.clear"],
  ["apps", "cmd.help.apps"]
];

export function runCommand(
  input: string,
  wm: WmApi,
  t: (k: string, v?: Record<string, string>) => string
): CommandResult {
  const line = input.trim();
  if (!line) return { handled: false };

  const [head, ...rest] = line.split(/\s+/);
  const cmd = head.toLowerCase();
  const arg = rest.join(" ").toLowerCase();
  const echoCmd = () => wm.echo(`$ ${line}`);

  switch (cmd) {
    case "help":
    case "?": {
      echoCmd();
      wm.echo(...HELP.map(([usage, key]) => `  ${usage.padEnd(14)} ${t(key)}`));
      return { handled: true };
    }

    case "apps": {
      echoCmd();
      wm.echo(
        ...APPS.map(
          (a) =>
            `  ${a.command.padEnd(10)} ${t(a.titleKey)}${
              a.ready ? "" : `  ${t("cmd.notReady")}`
            }`
        )
      );
      return { handled: true };
    }

    case "ls": {
      echoCmd();
      if (!wm.windows.length) {
        wm.echo(`  ${t("cmd.noWindows")}`);
        return { handled: true };
      }
      wm.echo(
        ...wm.windows.map((w) => {
          const def = APPS.find((a) => a.id === w.app)!;
          const state = w.minimized ? t("cmd.minimized") : t("cmd.open");
          return `  ${def.command.padEnd(10)} ${state}`;
        })
      );
      return { handled: true };
    }

    case "open": {
      echoCmd();
      const def = appByCommand(arg);
      if (!def) {
        wm.echo(`  ${t("cmd.unknownApp", { name: arg || "?" })}`);
        return { handled: true };
      }
      if (!def.ready) {
        wm.echo(`  ${t("cmd.appNotReady", { name: def.command })}`);
        return { handled: true };
      }
      wm.open(def.id);
      return { handled: true };
    }

    case "close": {
      echoCmd();
      const def = appByCommand(arg);
      if (!def) {
        wm.echo(`  ${t("cmd.unknownApp", { name: arg || "?" })}`);
        return { handled: true };
      }
      if (!wm.closeApp(def.id)) {
        wm.echo(`  ${t("cmd.notOpen", { name: def.command })}`);
      }
      return { handled: true };
    }

    case "dash": {
      echoCmd();
      wm.dash();
      return { handled: true };
    }

    case "startx": {
      echoCmd();
      wm.echo(`  ${t("cmd.startx")}`);
      wm.startx();
      return { handled: true };
    }

    case "tile": {
      echoCmd();
      wm.tile();
      return { handled: true };
    }

    case "clear": {
      wm.clearConsole();
      return { handled: true };
    }

    default: {
      // A bare app name opens it: `ops` is shorthand for `open ops`
      const def = rest.length === 0 ? appByCommand(cmd) : undefined;
      if (def) {
        echoCmd();
        if (def.ready) wm.open(def.id);
        else wm.echo(`  ${t("cmd.appNotReady", { name: def.command })}`);
        return { handled: true };
      }
      // Not a command — let the brain have it
      return { handled: false };
    }
  }
}
