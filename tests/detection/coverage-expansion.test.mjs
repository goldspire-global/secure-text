import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadDetectionLib } from './load-lib.mjs';

const lib = loadDetectionLib();

test('findApiKeys detects Anthropic and SendGrid prefixes', () => {
  const hits = lib.findApiKeys('key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz');
  assert.ok(hits.some((h) => h.matchedTextRaw.includes('sk-ant')));
  const sg = lib.findApiKeys('SG.abcdefghijklmnopqrstuvwxyz.1234567890');
  assert.ok(sg.length > 0);
});

test('findConnectionStrings detects postgres and Slack webhooks', () => {
  const pg = lib.findConnectionStrings('postgres://user:secretpass@db.example.com:5432/app');
  assert.ok(pg.some((h) => h.tags?.includes('connection_string')));
  const slack = lib.findConnectionStrings('https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXXXXXXXXXX');
  assert.ok(slack.length > 0);
});

test('findPrivateKeys detects PEM blocks', () => {
  const pem = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7
-----END PRIVATE KEY-----`;
  const hits = lib.findPrivateKeys(pem);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].category, 'private_key');
});

test('findRegionalNationalIds wave 2 — Netherlands BSN', () => {
  const hits = lib.findRegionalNationalIds('BSN: 123456782');
  assert.ok(hits.some((h) => h.tags?.includes('nl')));
});

test('findRegionalNationalIds wave 2 — Brazil CPF', () => {
  const hits = lib.findRegionalNationalIds('CPF 390.533.447-05');
  assert.ok(hits.some((h) => h.tags?.includes('br')));
});

test('findRegionalNationalIds wave 2 — Hong Kong HKID', () => {
  const hits = lib.findRegionalNationalIds('HKID G1000003');
  assert.ok(hits.some((h) => h.tags?.includes('hk')));
});

test('findRegionalNationalIds wave 2 — New Zealand IRD', () => {
  const hits = lib.findRegionalNationalIds('IRD 10000009');
  assert.ok(hits.some((h) => h.tags?.includes('nz')));
});

test('findRegionalNationalIds wave 2 — Germany Steuer-ID', () => {
  const hits = lib.findRegionalNationalIds('Steuer-ID 28374659102');
  assert.ok(hits.some((h) => h.tags?.includes('de')));
});

test('findRegionalNationalIds wave 2 — Sweden personnummer', () => {
  const hits = lib.findRegionalNationalIds('personnummer 800101-0001');
  assert.ok(hits.some((h) => h.tags?.includes('se')));
});

test('findRegionalNationalIds wave 2 — Norway fødselsnummer', () => {
  const hits = lib.findRegionalNationalIds('fødselsnummer 01026300556');
  assert.ok(hits.some((h) => h.tags?.includes('no')));
});

test('findRegionalNationalIds wave 2 — Denmark CPR', () => {
  const hits = lib.findRegionalNationalIds('CPR 010170-1234');
  assert.ok(hits.some((h) => h.tags?.includes('dk')));
});

test('findRegionalNationalIds wave 2 — Mexico CURP', () => {
  const hits = lib.findRegionalNationalIds('CURP XAXX010101HDFXXX01');
  assert.ok(hits.some((h) => h.tags?.includes('mx')));
});

test('findRegionalNationalIds wave 2 — Japan My Number', () => {
  const hits = lib.findRegionalNationalIds('My Number 1000 0000 0005');
  assert.ok(hits.some((h) => h.tags?.includes('jp')));
});

test('findRegionalNationalIds wave 2 — Korea RRN', () => {
  const hits = lib.findRegionalNationalIds('RRN 800101-1000008');
  assert.ok(hits.some((h) => h.tags?.includes('kr')));
});

test('findRegionalNationalIds wave 2 — Belgium NRN', () => {
  const hits = lib.findRegionalNationalIds('rijksregisternummer 85.07.30-033.28');
  assert.ok(hits.some((h) => h.tags?.includes('be')));
});

test('findRegionalNationalIds wave 2 — South Africa ID', () => {
  const hits = lib.findRegionalNationalIds('SA ID 8001015000086');
  assert.ok(hits.some((h) => h.tags?.includes('za')));
});

test('findRegionalNationalIds wave 2 — Taiwan ID', () => {
  const hits = lib.findRegionalNationalIds('TW ID A100000001');
  assert.ok(hits.some((h) => h.tags?.includes('tw')));
});

test('findRegionalNationalIds wave 2 — US ITIN', () => {
  const hits = lib.findRegionalNationalIds('ITIN 912-70-1234');
  assert.ok(hits.some((h) => h.tags?.includes('itin')));
});

test('findPhones detects labeled UK and AU numbers', () => {
  const uk = lib.findPhones('mobile: +44 7700 900123');
  assert.ok(uk.some((h) => h.tags?.includes('gb')));
  const au = lib.findPhones('tel +61 412 345 678');
  assert.ok(au.some((h) => h.tags?.includes('au')));
});

test('analyzeAll includes private keys and regional wave 2', () => {
  const hits = lib.analyzeAll('CPF 390.533.447-05 and postgres://u:p@host/db');
  assert.ok(hits.some((h) => h.category === 'national_id'));
  assert.ok(hits.some((h) => h.category === 'api_key' && h.tags?.includes('connection_string')));
});
