# Ask your project board questions from your AI assistant

Your project board already works in a browser, and nothing here is required. This is an
optional extra: it connects the board to an AI assistant that supports MCP (Model Context
Protocol), so you can ask about your project in plain language instead of clicking through
columns.

Questions it answers well:

- What's in progress right now?
- What's waiting on me?
- What finished this week?
- Is anything blocked?

**It is read-only.** You can ask the board anything you can already see, but the connection
cannot create, move, edit or comment on cards. If you try, it politely refuses. Changes to the
board stay with your project team, exactly as they do today.

---

## Step 1 — create your API key

An API key is how your assistant proves it is you. Think of it as a password that only reads.

1. Sign in to the board.
2. Open **Settings → API**.
3. Create a key and copy it. **You will only see it once.**

Keep it somewhere safe, like your password manager. Anyone who has it can read whatever you can
read, so do not paste it into an email, a chat message or a shared document.

## Step 2 — connect it

If you use Claude Code, run this in a terminal, replacing the two placeholders:

```bash
claude mcp add -s user --transport http projectboard https://kanboard-dc2835c6a332.herokuapp.com/api/mcp --header "Authorization: Bearer <YOUR-API-KEY>"
```

Replace `<YOUR-API-KEY>` with the key from Step 1. The address is the same for everyone; only
the key is yours.

`-s user` stores the setting in your own home folder rather than inside a project, so the key
cannot be committed to a code repository by accident.

Other MCP-capable assistants work too. They need the same three things: the address
`https://kanboard-dc2835c6a332.herokuapp.com/api/mcp`, the transport type **HTTP**, and the
header `Authorization: Bearer <YOUR-API-KEY>`.

## Step 3 — restart and try it

Restart your assistant so it picks up the new connection, then ask it something like
*"what's on my project board?"* If it answers with your real columns and cards, you're done.

---

## If it doesn't work

| What you see | What it means |
|---|---|
| `401` | The key is wrong, or was revoked. Create a new one. |
| `403` | You asked it to change something. The connection is read-only. |
| `500` on the very first try | A board setting is missing. Tell your project contact — it isn't your key. |
| Nothing appears | The assistant probably wasn't restarted after Step 2. |

## What it cannot see

- Any workspace you are not a member of. You see your project, and nothing else.
- The internal planning documents behind a card. Those are your project team's working notes
  and are never exposed through this connection, not even their file names.

## If your key ever leaks

Go to **Settings → API**, delete the key, and create a new one. The old key stops working
immediately. Then update Step 2 with the new key.
