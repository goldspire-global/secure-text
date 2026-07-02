# Veil personal user guide

Quick start for **Personal** profile users (no team, no join code).

> Screenshots: [docs/screenshots/](screenshots/README.md)

## Install

1. Install from [Veil on Microsoft Edge](https://microsoftedge.microsoft.com/addons/detail/veil/kfnpkdgfdpalmfibbkblkoncafpmcpkd) or [Chrome Web Store](https://chromewebstore.google.com/detail/veil/jecnnfblijhbkadedjpmkfmbfekeohml).
2. Open the Veil popup → **Personal** → **Quick setup** (or choose your own passphrase).

![Veil popup — personal setup complete](screenshots/popup-home-checklist.png)

## Daily use

| Action | What happens |
|--------|----------------|
| **Paste** a secret in email or a form | Copilot offers **Secure** or **Mask** |
| **Highlight** text | Veil bar appears with Quick / Options |
| **Ctrl+Shift+S** (⌘+Shift+S on Mac) | Secure selection with saved passphrase |
| **Ctrl+Shift+O** | Secure with options (one-time code, etc.) |

![Copilot when you paste sensitive text](screenshots/copilot-paste-modal.png)

Smart copilot stays quiet while you type name, email, or DOB on signup forms — but still catches API keys.

**Allow** dismisses the prompt for that field and snoozes the category on the site for 24 hours. **Always on this site** remembers the category locally (not for passwords, API keys, cards, or JWTs). Manage rules under **Settings → Always allow on these sites**.

## Recipients without Veil

Share the passphrase out of band. If you use one-time mode, share the unlock code separately. External recipients can use the [hosted unlock page](https://veil.goldspireventures.com/unlock.html) when you include a link.

## Settings

- **Veil copilot** — on by default; turn off in Settings if you prefer shortcut-only
- **On-page hints** — Smart / Always / Off
- **Always allow on these sites** — per-site rules from **Allow → Always on this site**; clear anytime in Settings
- **Share anonymous copilot signals** — on by default under Help; improves Veil for everyone (metadata only, never your text). Uncheck to opt out.
- **Feedback** — Help tab → Report a problem

## Help tab matches your settings

Open the extension popup → **Help** → **Your setup**. Veil explains how your current settings behave — for example why the Quick/Options pill does not appear when you highlight plain text in **Smart** mode, or why copilot stays quiet on signup forms. The **Why isn't something showing?** section only lists issues that apply to your configuration (copilot off, hints off, snoozed sites, missing passphrase, etc.).

From **Home**, use **How Veil behaves with your settings →** for the same guide.

## Upgrade to a team

Ask your admin for a join code, or [create a team](https://veil.goldspireventures.com/create.html) for your organization.
