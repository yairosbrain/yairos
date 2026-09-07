# YAIROS handoff — encrypted

`YAIROS-HANDOFF.md.enc` is the full project handoff, sealed with
**AES-256-GCM** (key stretched from a passphrase with PBKDF2-SHA256,
600,000 iterations, random salt + IV). It cannot be read without the
passphrase — there is no recovery path.

## Read it

```bash
node scripts/vault.mjs decrypt YAIROS-HANDOFF.md.enc
# prompts for the passphrase (hidden), writes YAIROS-HANDOFF.md
```

Or set it non-interactively:

```bash
YAIROS_PASS='...' node scripts/vault.mjs decrypt YAIROS-HANDOFF.md.enc
```

The decrypted `YAIROS-HANDOFF.md` is git-ignored — it stays local.

## Re-seal after editing

```bash
node scripts/vault.mjs encrypt YAIROS-HANDOFF.md   # -> YAIROS-HANDOFF.md.enc
```

## Same scheme, in the app

The in-app shell (`open shell`) uses the identical envelope:
`decrypt <file> <passphrase>` on a file whose contents are the `.enc`
text will open it there too. `man crypto` in the shell explains it.

## Hand it to another AI

Give it `YAIROS-HANDOFF.md.enc`, `scripts/vault.mjs`, and the passphrase.
It runs the decrypt command above and reads the Markdown — that file
alone is enough to understand and work on this project.
