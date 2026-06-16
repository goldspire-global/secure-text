# Team passphrase options

Organizations provision the shared team passphrase through **IT policy** or **Goldspire cloud** — not manual entry per user.

See [ORG_PROVISIONING.md](ORG_PROVISIONING.md) for the full model.

## Enterprise (IT policy)

Push `teamPassphrase` via Chrome/Edge managed storage (GPO / Intune). Users get one-click secure with no setup.

See [ENTERPRISE.md](ENTERPRISE.md).

## Cloud (join code / SSO)

Admin creates an organization in the Goldspire console and shares a join code. Users connect in the extension setup wizard. Passphrase rotation syncs automatically.

*(Backend API — configure `ORG_API_BASE` in constants when live.)*

## External password vault (optional)

For teams that keep the passphrase **only** in a password manager:

- Enable **From external vault** in policy or cloud settings
- Users enter once per browser session, then one-click for the rest of the session

**IT setup (any password manager):**

- Create a shared **Login** item
- **Title:** e.g. `Goldspire Team Passphrase`
- **Password:** your shared team secret (16+ characters)
- **Websites:** add every site where staff secure text

Goldspire does not integrate with a specific vault product.
