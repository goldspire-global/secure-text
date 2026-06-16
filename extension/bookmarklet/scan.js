(function () {
  async function unlockResolved(resolved, replaceNode) {
    return new Promise((resolve) => {
      GoldspireSecureUI.showPrompt({
        title: 'Unlock [redacted]',
        submitLabel: 'Unlock',
        fields: [
          {
            name: 'passphrase',
            label: 'Passphrase or one-time code',
            type: 'password',
            required: true,
            placeholder: 'Enter unlock phrase',
          },
        ],
        onSubmit: async ({ passphrase }) => {
          const secret = passphrase?.trim();
          if (!secret) throw new Error('Passphrase is required.');

          let plaintext;
          try {
            plaintext = await GoldspireSecureCrypto.decryptText(resolved.payload, secret);
          } catch {
            throw new Error('Wrong passphrase or corrupted text.');
          }

          const textNode = document.createTextNode(plaintext);
          replaceNode.replaceWith(textNode);

          GoldspireResecure.scheduleResecure({
            target: { kind: 'node', node: textNode },
            marker: resolved,
            secret,
            plaintext,
            delaySeconds: 60,
            onResecured: () => window.__gstBookmarkletScan?.(),
          });

          GoldspireSecureUI.showToast('Unlocked on this page.', 'success');
          resolve(plaintext);
        },
      });
    });
  }

  function onUnlock(resolved, replaceNode) {
    unlockResolved(resolved, replaceNode);
  }

  window.__gstBookmarkletScan = () => {
    GoldspireSecureDetector.scanDocument(onUnlock);
    GoldspireSecureUI.showToast('Scanning page for [redacted] text…', 'info');
  };

  window.__gstBookmarkletScan();
})();
