export type CommandHandler = (args: string[]) => Promise<void>;

export interface Subcommand {
  name: string;
  summary: string;
  examples: string[];
  flags: string[];
  load?: () => Promise<CommandHandler>;
}

export interface Command {
  name: string;
  aliases: string[];
  summary: string;
  examples: string[];
  subcommands: Subcommand[];
}

const handler =
  (loader: () => Promise<Record<string, unknown>>, name: string) =>
  async () => {
    const module = await loader();
    return module[name] as CommandHandler;
  };

const emailFlags = [
  "--help",
  "--json",
  "--mailbox",
  "--limit",
  "--body-type",
  "--to",
  "--cc",
  "--bcc",
  "--subject",
  "--body",
  "--body-file",
  "--stdin",
  "--html",
  "--query",
  "--from",
  "--before",
  "--after",
  "--attach",
  "--reply-to",
  "--reply-all",
  "--unread",
  "--flagged",
  "--raw",
];

const batchFlags = [
  "--help",
  "--json",
  "--ids",
  "--mailbox",
  "--query",
  "--in-mailbox",
  "--limit",
  "--dry-run",
  "--to",
  "--from",
  "--permanent",
  "--add-keyword",
  "--remove-keyword",
  "--add-mailbox",
  "--remove-mailbox",
];

const draftFlags = [
  "--help",
  "--json",
  "--limit",
  "--body-type",
  "--to",
  "--cc",
  "--bcc",
  "--subject",
  "--body",
  "--body-file",
  "--stdin",
  "--html",
];

const maskedFlags = [
  "--help",
  "--json",
  "--state",
  "--description",
  "--for-domain",
  "--prefix",
];
const threadFlags = [
  "--help",
  "--json",
  "--body-type",
  "--add-mailbox",
  "--remove-mailbox",
  "--add-keyword",
  "--remove-keyword",
];
const unsubscribeFlags = [
  "--help",
  "--json",
  "--mailbox",
  "--limit",
  "--query",
  "--from",
  "--open",
  "--interactive",
];

const subcommand = (
  name: string,
  summary: string,
  examples: string[],
  load: () => Promise<CommandHandler>,
  flags: string[] = ["--help", "--json"],
): Subcommand => ({ name, summary, examples, flags, load });

export const commands: Command[] = [
  {
    name: "attachment",
    aliases: [],
    summary: "List and download attachments",
    examples: [
      "fastmail attachment list EMAIL_ID",
      "fastmail attachment download EMAIL_ID --dir ./files",
    ],
    subcommands: [
      subcommand(
        "list",
        "List attachments on an email",
        ["fastmail attachment list EMAIL_ID"],
        handler(() => import("./attachment.js"), "listAttachments"),
      ),
      subcommand(
        "get",
        "Download one attachment",
        ["fastmail attachment get EMAIL_ID BLOB_ID --output ./file"],
        handler(() => import("./attachment.js"), "getAttachment"),
        ["--help", "--output", "-o"],
      ),
      subcommand(
        "download",
        "Download all attachments",
        ["fastmail attachment download EMAIL_ID --dir ./files"],
        handler(() => import("./attachment.js"), "downloadAllAttachments"),
        ["--help", "--json", "--dir"],
      ),
    ],
  },
  {
    name: "auth",
    aliases: [],
    summary: "Manage authentication",
    examples: [
      "fastmail auth login --token-file ~/.config/fastmail/token",
      "fastmail auth status --json",
    ],
    subcommands: [
      subcommand(
        "login",
        "Authenticate with an API token",
        [
          "fastmail auth login --token-file ./token",
          "fastmail auth login --token-file - < ./token",
        ],
        handler(() => import("./auth.js"), "loginCommand"),
        ["--help", "--token-file", "--token"],
      ),
      subcommand(
        "logout",
        "Remove stored credentials",
        ["fastmail auth logout"],
        handler(() => import("./auth.js"), "logoutCommand"),
      ),
      subcommand(
        "status",
        "Show authentication status",
        ["fastmail auth status --json"],
        handler(() => import("./auth.js"), "statusCommand"),
      ),
    ],
  },
  {
    name: "batch",
    aliases: [],
    summary: "Modify selected emails",
    examples: [
      "fastmail batch read --mailbox Inbox --limit 100",
      "fastmail batch move --to Archive --query 'before:2025-01-01'",
    ],
    subcommands: [
      subcommand(
        "read",
        "Mark emails as read",
        ["fastmail batch read EMAIL_ID"],
        handler(() => import("./batch.js"), "markRead"),
        batchFlags,
      ),
      subcommand(
        "unread",
        "Mark emails as unread",
        ["fastmail batch unread EMAIL_ID"],
        handler(() => import("./batch.js"), "markUnread"),
        batchFlags,
      ),
      subcommand(
        "flag",
        "Flag emails",
        ["fastmail batch flag EMAIL_ID"],
        handler(() => import("./batch.js"), "flagEmails"),
        batchFlags,
      ),
      subcommand(
        "unflag",
        "Remove email flags",
        ["fastmail batch unflag EMAIL_ID"],
        handler(() => import("./batch.js"), "unflagEmails"),
        batchFlags,
      ),
      subcommand(
        "move",
        "Move emails",
        ["fastmail batch move --to Archive EMAIL_ID"],
        handler(() => import("./batch.js"), "moveEmails"),
        batchFlags,
      ),
      subcommand(
        "delete",
        "Delete emails",
        ["fastmail batch delete EMAIL_ID"],
        handler(() => import("./batch.js"), "deleteEmails"),
        batchFlags,
      ),
      subcommand(
        "modify",
        "Modify keywords and mailboxes",
        ["fastmail batch modify --add-keyword '$flagged' EMAIL_ID"],
        handler(() => import("./batch.js"), "modifyEmails"),
        batchFlags,
      ),
    ],
  },
  {
    name: "completion",
    aliases: [],
    summary: "Generate shell completion",
    examples: [
      "source <(fastmail completion bash)",
      "fastmail completion fish | source",
    ],
    subcommands: ["bash", "zsh", "fish"].map((shell) =>
      subcommand(
        shell,
        `Generate ${shell} completion`,
        [`fastmail completion ${shell}`],
        handler(() => import("./system.js"), `${shell}CompletionCommand`),
        ["--help"],
      ),
    ),
  },
  {
    name: "draft",
    aliases: ["drafts"],
    summary: "Manage drafts",
    examples: [
      "fastmail draft list",
      "fastmail draft create --to person@example.com --subject Hello --body Hi",
    ],
    subcommands: [
      subcommand(
        "list",
        "List drafts",
        ["fastmail draft list"],
        handler(() => import("./draft.js"), "listDrafts"),
        draftFlags,
      ),
      subcommand(
        "get",
        "Get a draft",
        ["fastmail draft get DRAFT_ID"],
        handler(() => import("./draft.js"), "getDraft"),
        draftFlags,
      ),
      subcommand(
        "create",
        "Create a draft",
        ["fastmail draft create --body 'Draft'"],
        handler(() => import("./draft.js"), "createDraft"),
        draftFlags,
      ),
      subcommand(
        "update",
        "Replace a draft",
        ["fastmail draft update DRAFT_ID --subject Updated"],
        handler(() => import("./draft.js"), "updateDraft"),
        draftFlags,
      ),
      subcommand(
        "delete",
        "Delete a draft",
        ["fastmail draft delete DRAFT_ID"],
        handler(() => import("./draft.js"), "deleteDraft"),
        draftFlags,
      ),
      subcommand(
        "send",
        "Send a draft",
        ["fastmail draft send DRAFT_ID"],
        handler(() => import("./draft.js"), "sendDraft"),
        draftFlags,
      ),
    ],
  },
  {
    name: "email",
    aliases: [],
    summary: "Read, search, and send email",
    examples: [
      "fastmail email list --mailbox Inbox --limit 10",
      "fastmail email get EMAIL_ID",
    ],
    subcommands: [
      subcommand(
        "list",
        "List emails",
        ["fastmail email list --after 7d --unread"],
        handler(() => import("./email.js"), "listEmails"),
        emailFlags,
      ),
      subcommand(
        "get",
        "Get an email",
        ["fastmail email get EMAIL_ID"],
        handler(() => import("./email.js"), "getEmail"),
        emailFlags,
      ),
      subcommand(
        "send",
        "Send an email",
        [
          "fastmail email send --to person@example.com --subject Hello --body Hi",
        ],
        handler(() => import("./email.js"), "sendEmail"),
        emailFlags,
      ),
      subcommand(
        "search",
        "Search emails",
        ["fastmail email search 'from:person@example.com'"],
        handler(() => import("./email.js"), "searchEmails"),
        emailFlags,
      ),
      subcommand(
        "mark-read",
        "Mark emails as read",
        ["fastmail email mark-read EMAIL_ID"],
        handler(() => import("./email.js"), "markRead"),
        emailFlags,
      ),
      subcommand(
        "mark-unread",
        "Mark emails as unread",
        ["fastmail email mark-unread EMAIL_ID"],
        handler(() => import("./email.js"), "markUnread"),
        emailFlags,
      ),
    ],
  },
  {
    name: "help",
    aliases: [],
    summary: "Show command help",
    examples: ["fastmail help", "fastmail help email get"],
    subcommands: [],
  },
  {
    name: "mailbox",
    aliases: [],
    summary: "Manage mailboxes",
    examples: ["fastmail mailbox list", "fastmail mailbox create Receipts"],
    subcommands: [
      subcommand(
        "list",
        "List mailboxes",
        ["fastmail mailbox list --tree"],
        handler(() => import("./mailbox.js"), "listMailboxes"),
        ["--help", "--json", "--tree", "--parent", "--name", "--force"],
      ),
      subcommand(
        "create",
        "Create a mailbox",
        ["fastmail mailbox create Receipts"],
        handler(() => import("./mailbox.js"), "createMailbox"),
        ["--help", "--json", "--tree", "--parent", "--name", "--force"],
      ),
      subcommand(
        "update",
        "Update a mailbox",
        ["fastmail mailbox update MAILBOX_ID --name Receipts"],
        handler(() => import("./mailbox.js"), "updateMailbox"),
        ["--help", "--json", "--tree", "--parent", "--name", "--force"],
      ),
      subcommand(
        "delete",
        "Delete a mailbox",
        ["fastmail mailbox delete MAILBOX_ID"],
        handler(() => import("./mailbox.js"), "deleteMailbox"),
        ["--help", "--json", "--tree", "--parent", "--name", "--force"],
      ),
    ],
  },
  {
    name: "masked",
    aliases: [],
    summary: "Manage masked email addresses",
    examples: [
      "fastmail masked list",
      "fastmail masked create --for-domain example.com",
    ],
    subcommands: [
      subcommand(
        "list",
        "List masked addresses",
        ["fastmail masked list"],
        handler(() => import("./masked.js"), "listMaskedEmails"),
        maskedFlags,
      ),
      subcommand(
        "create",
        "Create a masked address",
        ["fastmail masked create --for-domain example.com"],
        handler(() => import("./masked.js"), "createMaskedEmail"),
        maskedFlags,
      ),
      subcommand(
        "update",
        "Update a masked address",
        ["fastmail masked update MASKED_ID --state disabled"],
        handler(() => import("./masked.js"), "updateMaskedEmail"),
        maskedFlags,
      ),
      subcommand(
        "delete",
        "Delete a masked address",
        ["fastmail masked delete MASKED_ID"],
        handler(() => import("./masked.js"), "deleteMaskedEmail"),
        maskedFlags,
      ),
    ],
  },
  {
    name: "skill",
    aliases: [],
    summary: "Locate agent instructions",
    examples: ["fastmail skill path"],
    subcommands: [
      subcommand(
        "path",
        "Print the bundled skill path",
        ["fastmail skill path", "fastmail skill path fastmail-cli"],
        handler(() => import("../skill.js"), "skillCommand"),
        ["--help"],
      ),
    ],
  },
  {
    name: "thread",
    aliases: [],
    summary: "Read and modify threads",
    examples: [
      "fastmail thread get THREAD_ID",
      "fastmail thread attachments THREAD_ID",
    ],
    subcommands: [
      subcommand(
        "get",
        "Get a thread",
        ["fastmail thread get THREAD_ID --body-type text"],
        handler(() => import("./thread.js"), "getThread"),
        threadFlags,
      ),
      subcommand(
        "modify",
        "Modify thread labels",
        ["fastmail thread modify THREAD_ID --add-keyword '$flagged'"],
        handler(() => import("./thread.js"), "modifyThread"),
        threadFlags,
      ),
      subcommand(
        "attachments",
        "List thread attachments",
        ["fastmail thread attachments THREAD_ID"],
        handler(() => import("./thread.js"), "threadAttachments"),
        threadFlags,
      ),
    ],
  },
  {
    name: "unsubscribe",
    aliases: [],
    summary: "Unsubscribe from newsletters",
    examples: [
      "fastmail unsubscribe show EMAIL_ID",
      "fastmail unsubscribe execute EMAIL_ID --auto",
    ],
    subcommands: [
      subcommand(
        "show",
        "Show unsubscribe methods",
        ["fastmail unsubscribe show EMAIL_ID"],
        handler(() => import("./unsubscribe.js"), "showUnsubscribe"),
        unsubscribeFlags,
      ),
      subcommand(
        "execute",
        "Execute an unsubscribe method",
        ["fastmail unsubscribe execute EMAIL_ID --auto"],
        handler(() => import("./unsubscribe.js"), "executeUnsubscribe"),
        [...unsubscribeFlags, "--method", "--auto"],
      ),
      subcommand(
        "batch",
        "Unsubscribe in batch",
        ["fastmail unsubscribe batch --mailbox Newsletters --dry-run"],
        handler(() => import("./unsubscribe.js"), "batchUnsubscribe"),
        [...unsubscribeFlags, "--dry-run", "--one-click-only"],
      ),
    ],
  },
  {
    name: "url",
    aliases: [],
    summary: "Generate FastMail web URLs",
    examples: [
      "fastmail url mailbox Inbox",
      "fastmail url compose --to person@example.com",
    ],
    subcommands: [
      subcommand(
        "email",
        "Generate email URLs",
        ["fastmail url email EMAIL_ID"],
        handler(() => import("./url.js"), "urlEmail"),
        ["--help", "--open"],
      ),
      subcommand(
        "mailbox",
        "Generate a mailbox URL",
        ["fastmail url mailbox Inbox"],
        handler(() => import("./url.js"), "urlMailbox"),
        ["--help", "--open"],
      ),
      subcommand(
        "search",
        "Generate a search URL",
        ["fastmail url search 'from:person@example.com'"],
        handler(() => import("./url.js"), "urlSearch"),
        ["--help", "--open"],
      ),
      subcommand(
        "compose",
        "Generate a compose URL",
        ["fastmail url compose --subject Hello"],
        handler(() => import("./url.js"), "urlCompose"),
        ["--help", "--open", "--to", "--subject", "--body"],
      ),
    ],
  },
];

export function findCommand(name: string): Command | undefined {
  return commands.find(
    (command) => command.name === name || command.aliases.includes(name),
  );
}

export function findSubcommand(
  command: Command,
  name: string,
): Subcommand | undefined {
  return command.subcommands.find((subcommand) => subcommand.name === name);
}
