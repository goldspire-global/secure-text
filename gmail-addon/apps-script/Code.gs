/**
 * Veil Gmail add-on — contextual trigger + hosted unlock pane.
 * Deploy with clasp; set WEB_APP_URL to your deployed doGet web app URL.
 */
var VEIL_HOST = 'https://veil.goldspireventures.com';
var CACHE_PREFIX = 'veil_gmail_body_';
var CACHE_TTL_SEC = 300;

function onGmailMessageOpen(e) {
  var accessToken = e.gmail.accessToken;
  var messageId = e.gmail.messageId;
  var body = fetchMessagePlainText(accessToken, messageId);
  var hasMarker = /\[redacted\]/i.test(body) || /goldspire:secure:/i.test(body);

  var card = CardService.newCardBuilder();
  card.setHeader(
    CardService.newCardHeader()
      .setTitle('Veil')
      .setSubtitle('Unlock [redacted] in this message')
      .setImageUrl(VEIL_HOST + '/icons/icon-48.png')
  );

  var section = CardService.newCardSection();
  if (!hasMarker) {
    section.addWidget(
      CardService.newTextParagraph().setText('No [redacted] markers found in this message.')
    );
    section.addWidget(
      CardService.newTextParagraph().setText(
        'To secure before send, use the Veil browser extension in Gmail on the web.'
      )
    );
  } else {
    var token = Utilities.getUuid();
    CacheService.getUserCache().put(CACHE_PREFIX + token, body, CACHE_TTL_SEC);
    var unlockUrl = getWebAppUrl() + '?t=' + encodeURIComponent(token);
    section.addWidget(
      CardService.newTextParagraph().setText(
        'Secured content detected. Unlock locally — your passphrase never leaves this panel.'
      )
    );
    section.addWidget(
      CardService.newTextButton()
        .setText('Unlock with Veil')
        .setOpenLink(
          CardService.newOpenLink()
            .setUrl(unlockUrl)
            .setOpenAs(CardService.OpenAs.OVERLAY)
            .setOnClose(CardService.OnClose.NOTHING)
        )
    );
  }

  card.addSection(section);
  card.addSection(
    CardService.newCardSection().addWidget(
      CardService.newTextParagraph().setText(
        '<a href="' + VEIL_HOST + '/install.html">Install Veil</a> for compose & copilot in Gmail web.'
      )
    )
  );

  return card.build();
}

function doGet(e) {
  var token = e && e.parameter && e.parameter.t;
  if (!token) {
    return HtmlService.createHtmlOutput('<p>Missing session token.</p>');
  }
  var body = CacheService.getUserCache().get(CACHE_PREFIX + token);
  if (!body) {
    return HtmlService.createHtmlOutput('<p>Session expired — close and open Veil again from the message.</p>');
  }

  var t = HtmlService.createTemplateFromFile('Sidebar');
  t.bodyJson = JSON.stringify(body);
  return t.evaluate()
    .setTitle('Veil — Gmail unlock')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getWebAppUrl() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('VEIL_GMAIL_WEB_APP_URL');
  if (url) return url;
  return VEIL_HOST + '/gmail-addon/taskpane.html';
}

function fetchMessagePlainText(accessToken, messageId) {
  var url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + messageId + '?format=full';
  var response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) return '';
  var data = JSON.parse(response.getContentText());
  return extractPlainBody(data);
}

function extractPlainBody(message) {
  if (!message || !message.payload) return '';
  return walkParts(message.payload);
}

function walkParts(part) {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body && part.body.data) {
    return Utilities.newBlob(Utilities.base64Decode(part.body.data)).getDataAsString();
  }
  if (part.parts && part.parts.length) {
    for (var i = 0; i < part.parts.length; i++) {
      var text = walkParts(part.parts[i]);
      if (text) return text;
    }
  }
  if (part.mimeType === 'text/html' && part.body && part.body.data) {
    var html = Utilities.newBlob(Utilities.base64Decode(part.body.data)).getDataAsString();
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}
