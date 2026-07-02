/**
 * Veil Outlook add-in — read-pane unlock for [redacted] markers (desktop Outlook).
 */
(function () {
  let itemBody = '';

  function replaceInBody(body, marker, unlocked) {
    if (!Office?.context?.mailbox?.item?.body?.setAsync) {
      return Promise.resolve();
    }
    const next = body.replace(marker.fullMarker, unlocked);
    return new Promise((resolve, reject) => {
      Office.context.mailbox.item.body.setAsync(next, { coercionType: Office.CoercionType.Html }, (result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded) resolve();
        else reject(new Error(result.error?.message || 'Could not update message.'));
      });
    });
  }

  function getBody() {
    return new Promise((resolve, reject) => {
      const item = Office.context.mailbox?.item;
      if (!item?.body?.getAsync) {
        resolve(null);
        return;
      }
      item.body.getAsync(Office.CoercionType.Text, (asyncResult) => {
        if (asyncResult.status !== Office.AsyncResultStatus.Succeeded) {
          reject(new Error('Could not read message body.'));
          return;
        }
        itemBody = asyncResult.value || '';
        resolve(itemBody);
      });
    });
  }

  Office.onReady(() => {
    globalThis.VeilMailUnlock.boot({
      getBody,
      replaceBody: (body, marker, unlocked) => replaceInBody(body, marker, unlocked),
    });
  });
})();
