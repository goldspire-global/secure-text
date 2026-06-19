# Veil — member guide

Quick start for **Veil by Goldspire** in Outlook, Gmail, and the web.

**Admin setup?** Your IT owner should follow [ADMIN_GUIDE.md](ADMIN_GUIDE.md).  
**Install links:** [join-veil install page](https://join-veil.goldspireventures.com/install.html)

> Screenshots: [docs/screenshots/](screenshots/README.md) — visual walkthrough below.

## Install & join

1. Install Veil (from your IT catalog or install page your admin shared)
2. Click the Veil icon → choose **Team**
3. Enter **join code** and **work email** from your admin
4. Save the **team passphrase** when prompted
5. **Refresh** your Outlook or Gmail tab (F5)

Check the popup **Home** tab — the setup checklist should be all green.

![Veil popup — team connected and ready](screenshots/popup-home-checklist.png)

## Secure a secret

| Method | What to do |
|--------|------------|
| **Paste** | Paste sensitive text → Veil copilot modal → Secure / Mask / Tokenize |
| **Highlight** | Select text → Veil bar appears → choose an action |
| **Shortcut** | Highlight → `Ctrl+Shift+S` to secure as `[redacted]` |

When you **paste** a secret into compose, Veil shows a copilot modal before the text lands in the message:

![Copilot modal after pasting a secret](screenshots/copilot-paste-modal.png)

**Smart copilot** stays quiet while you type name, email, or date of birth on signup forms — but still catches API keys and other secrets.

## Unlock received content

- Click `[redacted]` or `[veil:vt_…]` in the email
- Enter team passphrase if asked
- Use **Re-lock** or wait for auto re-lock when done

![Redacted text in email — click to unlock](screenshots/email-redacted-unlock.png)

## Tokenize (team email)

**Tokenize** replaces text with `[veil:vt_…]`. Teammates in the same org click to reveal. Works across Outlook and Gmail if both have Veil installed and joined.

![Veil token placeholder in email](screenshots/email-veil-token.png)

## Multiple browsers

Edge and Chrome are separate installs — join your team in **each browser** you use.

## Get help

- Extension popup → **Help** tab → quick start, shortcuts, feedback
- [False copilot alert](https://join-veil.goldspireventures.com/feedback.html) — helps us tune detection (no secrets in the form)
- Ask your admin for join code or passphrase reset
