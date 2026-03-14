#!/usr/bin/env bun
import {
  getAuthStatus,
  login,
  logout,
  promptForToken,
  readTokenFromStdin,
} from "./auth";
import { parseArgs, printCompletion, printHelp, printVersion } from "./cli";
import {
  downloadAllAttachments,
  getAttachment,
  listAttachments,
} from "./commands/attachment";
import {
  markRead as batchMarkRead,
  markUnread as batchMarkUnread,
  deleteEmails,
  flagEmails,
  modifyEmails,
  moveEmails,
  unflagEmails,
} from "./commands/batch";
import {
  createDraft,
  deleteDraft,
  getDraft,
  listDrafts,
  sendDraft,
  updateDraft,
} from "./commands/draft";
import {
  markRead as emailMarkRead,
  markUnread as emailMarkUnread,
  getEmail,
  listEmails,
  searchEmails,
  sendEmail,
} from "./commands/email";
import {
  createMailbox,
  deleteMailbox,
  listMailboxes,
  updateMailbox,
} from "./commands/mailbox";
import {
  createMaskedEmail,
  deleteMaskedEmail,
  listMaskedEmails,
  updateMaskedEmail,
} from "./commands/masked";
import { getThread, modifyThread, threadAttachments } from "./commands/thread";
import {
  batchUnsubscribe,
  executeUnsubscribe,
  showUnsubscribe,
} from "./commands/unsubscribe";
import { urlCommand } from "./commands/url";
import { getConfigPath } from "./config";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.version) {
    printVersion();
    process.exit(0);
  }

  if (options.completion) {
    const success = printCompletion(options.completion);
    process.exit(success ? 0 : 1);
  }

  // Show global help only if no command specified
  if (!options.command) {
    printHelp();
    process.exit(options.help ? 0 : 1);
  }

  // Pass help flag to subcommand handlers
  const subcommandArgs = options.help
    ? ["--help", ...options.args]
    : options.args;

  // Route to command handlers
  switch (options.command) {
    case "auth":
      await handleAuth(options.subcommand, subcommandArgs);
      break;
    case "batch":
      await handleBatch(options.subcommand, subcommandArgs);
      break;
    case "email":
      await handleEmail(options.subcommand, subcommandArgs);
      break;
    case "mailbox":
      await handleMailbox(options.subcommand, subcommandArgs);
      break;
    case "masked":
      await handleMasked(options.subcommand, subcommandArgs);
      break;
    case "unsubscribe":
      await handleUnsubscribe(options.subcommand, subcommandArgs);
      break;
    case "attachment":
      await handleAttachment(options.subcommand, subcommandArgs);
      break;
    case "thread":
      await handleThread(options.subcommand, subcommandArgs);
      break;
    case "draft":
    case "drafts":
      await handleDraft(options.subcommand, subcommandArgs);
      break;
    case "url":
      await handleUrl(options.subcommand, subcommandArgs);
      break;
    default:
      console.error(`Unknown command: ${options.command}`);
      printHelp();
      process.exit(1);
  }
}

function parseAuthArgs(args: string[]): { token?: string; help: boolean } {
  let token: string | undefined;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      help = true;
    } else if (arg === "--token" && args[i + 1]) {
      token = args[i + 1];
      i++;
    } else if (arg?.startsWith("--token=")) {
      token = arg.slice(8);
    }
  }

  return { token, help };
}

async function handleAuth(
  subcommand: string | null,
  args: string[],
): Promise<void> {
  const parsed = parseAuthArgs(args);

  switch (subcommand) {
    case "login": {
      if (parsed.help) {
        console.log(`
Usage: fastmail auth login [--token <token>]

Authenticate with FastMail using an API token.

Options:
  --token <token>  API token (can also be piped via stdin)
  -h, --help       Show this help

Get your API token from:
  FastMail Settings > Privacy & Security > API tokens
`);
        return;
      }

      // Get token from: 1) --token flag, 2) stdin, 3) interactive prompt
      let token = parsed.token;

      if (!token) {
        token = (await readTokenFromStdin()) ?? undefined;
      }

      if (!token) {
        token = await promptForToken();
      }

      if (!token) {
        console.error("Error: No API token provided");
        process.exit(1);
      }

      console.log("Validating token...");
      const result = await login(token);

      if (result.success) {
        console.log(`Authenticated as: ${result.username}`);
        if (result.accountName) {
          console.log(`Primary account: ${result.accountName}`);
        }
        console.log(`Token saved to: ${getConfigPath()}`);
      } else {
        console.error(`Login failed: ${result.error}`);
        process.exit(1);
      }
      break;
    }

    case "logout": {
      if (parsed.help) {
        console.log(`
Usage: fastmail auth logout

Remove stored API token from config file.

Options:
  -h, --help  Show this help
`);
        return;
      }

      await logout();
      console.log("Logged out. Token removed from config.");
      break;
    }

    case "status": {
      if (parsed.help) {
        console.log(`
Usage: fastmail auth status

Show current authentication status.

Options:
  -h, --help  Show this help
`);
        return;
      }

      const status = await getAuthStatus();

      if (status.authenticated) {
        console.log(`Status: Authenticated`);
        console.log(`User: ${status.username}`);
        if (status.accountName) {
          console.log(`Account: ${status.accountName}`);
        }
        console.log(
          `Token source: ${status.tokenSource === "env" ? "FASTMAIL_API_TOKEN env var" : "config file"}`,
        );
      } else {
        console.log(`Status: Not authenticated`);
        if (status.error) {
          console.log(`Reason: ${status.error}`);
        }
        if (status.tokenSource) {
          console.log(
            `Token source: ${status.tokenSource === "env" ? "FASTMAIL_API_TOKEN env var" : "config file"}`,
          );
        }
        process.exit(1);
      }
      break;
    }

    default:
      console.error(
        `Usage: fastmail auth <login|logout|status>\n\nSubcommands:\n  login   Authenticate with API token\n  logout  Remove stored credentials\n  status  Show authentication status`,
      );
      process.exit(1);
  }
}

async function handleEmail(
  subcommand: string | null,
  args: string[],
): Promise<void> {
  switch (subcommand) {
    case "list":
      await listEmails(args);
      break;
    case "get":
      await getEmail(args);
      break;
    case "send":
      await sendEmail(args);
      break;
    case "search":
      await searchEmails(args);
      break;
    case "mark-read":
      await emailMarkRead(args);
      break;
    case "mark-unread":
      await emailMarkUnread(args);
      break;
    default:
      console.error(
        `Usage: fastmail email <list|get|send|search|mark-read|mark-unread>\n\nSubcommands:\n  list        List emails in a mailbox\n  get         Get email by ID\n  send        Send an email\n  search      Search emails\n  mark-read   Mark emails as read\n  mark-unread Mark emails as unread`,
      );
      process.exit(1);
  }
}

async function handleMailbox(
  subcommand: string | null,
  args: string[],
): Promise<void> {
  switch (subcommand) {
    case "list":
      await listMailboxes(args);
      break;
    case "create":
      await createMailbox(args);
      break;
    case "update":
      await updateMailbox(args);
      break;
    case "delete":
      await deleteMailbox(args);
      break;
    default:
      console.error(
        `Usage: fastmail mailbox <list|create|update|delete>\n\nSubcommands:\n  list    List all mailboxes\n  create  Create a mailbox\n  update  Update a mailbox\n  delete  Delete a mailbox`,
      );
      process.exit(1);
  }
}

async function handleMasked(
  subcommand: string | null,
  args: string[],
): Promise<void> {
  switch (subcommand) {
    case "list":
      await listMaskedEmails(args);
      break;
    case "create":
      await createMaskedEmail(args);
      break;
    case "update":
      await updateMaskedEmail(args);
      break;
    case "delete":
      await deleteMaskedEmail(args);
      break;
    default:
      console.error(
        `Usage: fastmail masked <list|create|update|delete>\n\nSubcommands:\n  list    List masked email addresses\n  create  Create a masked email\n  update  Update a masked email\n  delete  Delete a masked email`,
      );
      process.exit(1);
  }
}

async function handleBatch(
  subcommand: string | null,
  args: string[],
): Promise<void> {
  switch (subcommand) {
    case "read":
      await batchMarkRead(args);
      break;
    case "unread":
      await batchMarkUnread(args);
      break;
    case "flag":
      await flagEmails(args);
      break;
    case "unflag":
      await unflagEmails(args);
      break;
    case "move":
      await moveEmails(args);
      break;
    case "delete":
      await deleteEmails(args);
      break;
    case "modify":
      await modifyEmails(args);
      break;
    default:
      console.error(
        `Usage: fastmail batch <read|unread|flag|unflag|move|delete|modify>\n\nSubcommands:\n  read     Mark emails as read\n  unread   Mark emails as unread\n  flag     Flag/star emails\n  unflag   Remove flag/star from emails\n  move     Move emails to a mailbox\n  delete   Delete emails (move to Trash or permanent)\n  modify   Generic email modification`,
      );
      process.exit(1);
  }
}

async function handleUnsubscribe(
  subcommand: string | null,
  args: string[],
): Promise<void> {
  switch (subcommand) {
    case "show":
      await showUnsubscribe(args);
      break;
    case "execute":
      await executeUnsubscribe(args);
      break;
    case "batch":
      await batchUnsubscribe(args);
      break;
    default:
      console.error(
        `Usage: fastmail unsubscribe <show|execute|batch>\n\nSubcommands:\n  show     Show unsubscribe methods for an email\n  execute  Execute unsubscribe for an email\n  batch    Batch unsubscribe from newsletters`,
      );
      process.exit(1);
  }
}

async function handleAttachment(
  subcommand: string | null,
  args: string[],
): Promise<void> {
  switch (subcommand) {
    case "list":
      await listAttachments(args);
      break;
    case "get":
      await getAttachment(args);
      break;
    case "download":
      await downloadAllAttachments(args);
      break;
    default:
      console.error(
        `Usage: fastmail attachment <list|get|download>\n\nSubcommands:\n  list      List attachments on an email\n  get       Download a specific attachment\n  download  Download all attachments from an email`,
      );
      process.exit(1);
  }
}

async function handleThread(
  subcommand: string | null,
  args: string[],
): Promise<void> {
  switch (subcommand) {
    case "get":
      await getThread(args);
      break;
    case "modify":
      await modifyThread(args);
      break;
    case "attachments":
      await threadAttachments(args);
      break;
    default:
      console.error(
        `Usage: fastmail thread <get|modify|attachments>\n\nSubcommands:\n  get          Get a thread with all messages\n  modify       Modify labels/keywords on all emails in a thread\n  attachments  List all attachments in a thread`,
      );
      process.exit(1);
  }
}

async function handleUrl(
  subcommand: string | null,
  args: string[],
): Promise<void> {
  await urlCommand(subcommand, args);
}

async function handleDraft(
  subcommand: string | null,
  args: string[],
): Promise<void> {
  switch (subcommand) {
    case "list":
      await listDrafts(args);
      break;
    case "get":
      await getDraft(args);
      break;
    case "create":
      await createDraft(args);
      break;
    case "update":
      await updateDraft(args);
      break;
    case "delete":
      await deleteDraft(args);
      break;
    case "send":
      await sendDraft(args);
      break;
    default:
      console.error(
        `Usage: fastmail draft <list|get|create|update|delete|send>\n\nSubcommands:\n  list    List all drafts\n  get     Get draft by ID\n  create  Create a new draft\n  update  Update an existing draft\n  delete  Delete a draft\n  send    Send a draft`,
      );
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
