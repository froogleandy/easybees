# 🐝 Easy Bees — Music Business Manager

A clean, local-first music professional business management app.
**No npm. No build tools. Open `index.html` and go.**

---

## Quick Start

```bash
# Option 1 — Python (simplest)
cd easy-bees-vanilla
python3 -m http.server 8080
# Open http://localhost:8080

# Option 2 — Node http-server
npx http-server . -p 8080

# Option 3 — VS Code
# Install "Live Server" extension → right-click index.html → Open with Live Server
```

> ⚠️ Must be served over HTTP (not file://) for ES modules and Google OAuth to work.

---

## Modules

| Module    | Description |
|-----------|-------------|
| Dashboard | Revenue stats, recent gigs, invoices, task summary |
| Mail      | Gmail OAuth — read inbox, compose, send |
| Contacts  | CRM with timeline, linked gigs & invoices |
| Gigs      | 7-step booking flow, double-booking detection |
| Calendar  | Month view, gig dots color-coded by status |
| Tasks     | Kanban drag-and-drop board with custom columns |
| Money     | Invoices + Expenses, Claude AI receipt scanning |

---

## Gmail API Setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. "Easy Bees")
3. Navigate to **APIs & Services → Library**
4. Enable **Gmail API**
5. Go to **APIs & Services → Credentials**
6. Click **+ Create Credentials → OAuth 2.0 Client ID**
7. Application type: **Web Application**
8. Add to **Authorized JavaScript Origins**:
   ```
   http://localhost:8080
   ```
9. Copy the **Client ID**
10. In Easy Bees → Mail → Connect Gmail → paste Client ID → Save

---

## Google Calendar API Setup

1. Same project in Google Console
2. Enable **Google Calendar API**
3. Use the same OAuth Client ID (or create a new one)
4. In Easy Bees → Calendar → Google Calendar → paste Client ID → Save

---

## Claude AI Receipt Scanning

The Expenses module uses Claude's Vision API to auto-extract:
- **Amount** (grand total)
- **Date** (of purchase)
- **Vendor** (store name)

A token usage tracker appears (bottom-right) after first scan showing:
- Input / output tokens per call
- Estimated cost per call
- Running session total

**No API key required** — handled by the Easy Bees hosting environment.

---

## Data Storage

All data lives in **localStorage** under the `eb_` prefix:

| Key             | Contents           |
|-----------------|--------------------|
| `eb_contacts`   | CRM contacts       |
| `eb_gigs`       | Gig bookings       |
| `eb_tasks`      | Kanban task cards  |
| `eb_invoices`   | Invoices           |
| `eb_expenses`   | Expense records    |
| `eb_timeline`   | Contact timeline   |
| `eb_settings`   | App configuration  |

**Export / Backup:** Money → Backup button downloads a full JSON backup.

---

## File Structure

```
easy-bees-vanilla/
├── index.html              ← App shell (single HTML file)
├── css/
│   └── app.css             ← Dark theme, all custom styles
├── js/
│   ├── app.js              ← Entry point — imports all modules
│   ├── core.js             ← Router, event bus, UI helpers
│   ├── dataService.js      ← All localStorage reads/writes
│   ├── validators.js       ← All validation logic
│   ├── utils.js            ← Shared utilities
│   └── modules/
│       ├── dashboard.js
│       ├── mail.js
│       ├── contacts.js
│       ├── gigs.js
│       ├── calendar.js
│       ├── tasks.js
│       └── money.js
└── README.md
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K`    | Global search |
| `ESC`   | Close modal / panel / search |

---

## Tech Stack

- **Vanilla JS** — ES modules, no framework
- **Tailwind CSS** — via CDN
- **Google Fonts** — Outfit + JetBrains Mono
- **Gmail API** — OAuth 2.0 token flow
- **Claude AI API** — receipt vision scanning
- **localStorage** — all data, local-first

---

*Built with 🐝 Easy Bees*
