# tilde

**About `key` in `manifest.json`:** this is a public key, not a secret. Brave derives the
extension ID from it, so saved sites survive reloading the extension from a different
folder. The private half was never kept. Remove it (or replace it with the Web Store's
key) before publishing.
