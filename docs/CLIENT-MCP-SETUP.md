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

**It respects your board permissions exactly.** What you can do in the browser is what the connection can do, nothing more. If your role is view-only, the connection reads only. If you can comment or edit cards, the connection can too.

---

## Setup — three steps, two minutes

### Step 1 — add the connector

In your AI assistant, add a new MCP connector and point it at:

```
https://kanboard-gateway-cbfc174dc099.herokuapp.com/api/mcp
```

There is no API key field. Leave any key or token field blank.

- **Claude (claude.ai):** Settings → Integrations → Add custom integration → paste the address above.
- **Claude Code (CLI):** `claude mcp add -s user --transport http projectboard https://kanboard-gateway-cbfc174dc099.herokuapp.com/api/mcp`
- **Other MCP-capable assistants:** use HTTP transport, the address above, and no authentication header.

### Step 2 — sign in

Your assistant will open a sign-in page. Enter the email address your board invite was sent to
and click **Send link**. An email will arrive with a sign-in link. Click it once and you will
land back at a consent screen.

No password, no API key. The email just confirms you are who you say you are.

### Step 3 — allow access

On the consent screen, click **Allow**. Your assistant will then have access to your board. Ask
it something like *"what's on my project board?"* and it will answer with your real cards and
columns.

---

## If it doesn't work

| What you see | What to do |
|---|---|
| Sign-in page says "no account for this email" | The email you entered doesn't match your board invite. Use the exact address the invite went to. |
| Sign-in link says "invalid or expired" | Links expire after a few minutes and can only be clicked once. Go back and request a new one. |
| Consent page doesn't appear | Close the browser tab and try adding the connector again from Step 1. |
| `403` after connecting | You asked it to change something. The connection is read-only. |

## If you need to disconnect

Remove the connector from your assistant's settings. Your board is not affected, nothing
changes on the board side when you disconnect.
