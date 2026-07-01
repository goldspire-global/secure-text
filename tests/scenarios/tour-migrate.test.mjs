import test from 'node:test';
import assert from 'node:assert/strict';
import { loadExtensionModule } from './helpers.mjs';

test('migrateSettings skips auto tour for existing setupComplete installs', () => {
  const g = loadExtensionModule('extension/src/settings-migrate.js');
  const migrated = g.GoldspireSettingsMigrate.migrateSettings({
    setupComplete: true,
    copilotEnabled: 'on',
  });
  assert.equal(migrated.tourComplete, true);
  assert.equal(migrated.copilotEnabled, true);
});

test('migrateSettings leaves tourComplete false for fresh installs', () => {
  const g = loadExtensionModule('extension/src/settings-migrate.js');
  const migrated = g.GoldspireSettingsMigrate.migrateSettings({
    setupComplete: false,
    tourComplete: false,
  });
  assert.equal(migrated.tourComplete, false);
});
