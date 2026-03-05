import type { Command } from "commander";
import { dashboardCommand } from "../../commands/dashboard.js";
import { doctorCommand } from "../../commands/doctor.js";
import {
  guardianDiff,
  guardianList,
  guardianPrune,
  guardianRestore,
  guardianSnapshot,
  guardianStatus,
} from "../../commands/guardian.js";
import { resetCommand } from "../../commands/reset.js";
import { uninstallCommand } from "../../commands/uninstall.js";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerMaintenanceCommands(program: Command) {
  program
    .command("doctor")
    .description("Health checks + quick fixes for the gateway and channels")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/doctor", "docs.openclaw.ai/cli/doctor")}\n`,
    )
    .option("--no-workspace-suggestions", "Disable workspace memory system suggestions", false)
    .option("--yes", "Accept defaults without prompting", false)
    .option("--repair", "Apply recommended repairs without prompting", false)
    .option("--fix", "Apply recommended repairs (alias for --repair)", false)
    .option("--force", "Apply aggressive repairs (overwrites custom service config)", false)
    .option("--non-interactive", "Run without prompts (safe migrations only)", false)
    .option("--generate-gateway-token", "Generate and configure a gateway token", false)
    .option("--deep", "Scan system services for extra gateway installs", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await doctorCommand(defaultRuntime, {
          workspaceSuggestions: opts.workspaceSuggestions,
          yes: Boolean(opts.yes),
          repair: Boolean(opts.repair) || Boolean(opts.fix),
          force: Boolean(opts.force),
          nonInteractive: Boolean(opts.nonInteractive),
          generateGatewayToken: Boolean(opts.generateGatewayToken),
          deep: Boolean(opts.deep),
        });
        defaultRuntime.exit(0);
      });
    });

  program
    .command("dashboard")
    .description("Open the Control UI with your current token")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/dashboard", "docs.openclaw.ai/cli/dashboard")}\n`,
    )
    .option("--no-open", "Print URL but do not launch a browser")
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await dashboardCommand(defaultRuntime, {
          noOpen: opts.open === false,
        });
      });
    });

  program
    .command("reset")
    .description("Reset local config/state (keeps the CLI installed)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/reset", "docs.openclaw.ai/cli/reset")}\n`,
    )
    .option("--scope <scope>", "config|config+creds+sessions|full (default: interactive prompt)")
    .option("--yes", "Skip confirmation prompts", false)
    .option("--non-interactive", "Disable prompts (requires --scope + --yes)", false)
    .option("--dry-run", "Print actions without removing files", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await resetCommand(defaultRuntime, {
          scope: opts.scope,
          yes: Boolean(opts.yes),
          nonInteractive: Boolean(opts.nonInteractive),
          dryRun: Boolean(opts.dryRun),
        });
      });
    });

  // ── guardian ──────────────────────────────────────────────────────────────
  const guardian = program
    .command("guardian")
    .description("Snapshot, restore, and diff config for disaster recovery");

  guardian
    .command("snapshot")
    .description("Save a snapshot of the current config (health-checked)")
    .option("--tag <tag>", "Label this snapshot for easy retrieval")
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await guardianSnapshot(defaultRuntime, { tag: opts.tag });
        defaultRuntime.exit(0);
      });
    });

  guardian
    .command("restore [target]")
    .description("Restore config from a snapshot (default: latest healthy)")
    .option("--yes", "Skip confirmation prompt", false)
    .option("--non-interactive", "Disable prompts", false)
    .action(async (target, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await guardianRestore(defaultRuntime, {
          target,
          yes: Boolean(opts.yes),
          nonInteractive: Boolean(opts.nonInteractive),
        });
        defaultRuntime.exit(0);
      });
    });

  guardian
    .command("list")
    .description("List all snapshots")
    .action(() => {
      guardianList(defaultRuntime);
    });

  guardian
    .command("diff [target]")
    .description("Diff current config against a snapshot (default: latest healthy)")
    .action((target) => {
      guardianDiff(defaultRuntime, { target });
    });

  guardian
    .command("prune")
    .description("Remove old snapshots, keeping the most recent N")
    .option("--keep <n>", "Number of snapshots to keep", "10")
    .option("--yes", "Skip confirmation prompt", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await guardianPrune(defaultRuntime, {
          keep: Number(opts.keep),
          yes: Boolean(opts.yes),
        });
        defaultRuntime.exit(0);
      });
    });

  guardian
    .command("status")
    .description("Show gateway health and snapshot summary")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await guardianStatus(defaultRuntime);
        defaultRuntime.exit(0);
      });
    });

  program
    .command("uninstall")
    .description("Uninstall the gateway service + local data (CLI remains)")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/uninstall", "docs.openclaw.ai/cli/uninstall")}\n`,
    )
    .option("--service", "Remove the gateway service", false)
    .option("--state", "Remove state + config", false)
    .option("--workspace", "Remove workspace dirs", false)
    .option("--app", "Remove the macOS app", false)
    .option("--all", "Remove service + state + workspace + app", false)
    .option("--yes", "Skip confirmation prompts", false)
    .option("--non-interactive", "Disable prompts (requires --yes)", false)
    .option("--dry-run", "Print actions without removing files", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await uninstallCommand(defaultRuntime, {
          service: Boolean(opts.service),
          state: Boolean(opts.state),
          workspace: Boolean(opts.workspace),
          app: Boolean(opts.app),
          all: Boolean(opts.all),
          yes: Boolean(opts.yes),
          nonInteractive: Boolean(opts.nonInteractive),
          dryRun: Boolean(opts.dryRun),
        });
      });
    });
}
