function clip(value, max) {
  return String(value || '').trim().slice(0, max);
}

export function parseClientInfo(req) {
  const ua = String(req?.headers?.['user-agent'] || '');
  const extensionVersion = clip(req?.headers?.['x-extension-version'], 32);
  let browser = clip(req?.headers?.['x-client-browser'], 64);
  let platform = clip(req?.headers?.['x-client-platform'], 64);

  if (!browser) {
    if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';
    else if (/Chrome\//i.test(ua)) browser = 'Chrome';
    else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
    else browser = ua ? 'Other' : '';
  }

  if (!platform) {
    if (/Windows/i.test(ua)) platform = 'Windows';
    else if (/Macintosh|Mac OS X/i.test(ua)) platform = 'macOS';
    else if (/Linux/i.test(ua)) platform = 'Linux';
    else if (/CrOS/i.test(ua)) platform = 'ChromeOS';
    else platform = '';
  }

  return { extensionVersion, browser, platform };
}
