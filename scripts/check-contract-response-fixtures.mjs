#!/usr/bin/env node
// Check the shared mock responses against the contract specs extracted from WASM.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = JSON.parse(readFileSync(resolve(root, 'fixtures/contract-responses.json'), 'utf8'));
const responses = {
  get_agent: ['agent_wallet_factory', 'AgentInfo'],
  get_channel: ['payment_channel', 'Channel'],
  get_job: ['escrow', 'Job'],
  get_limits: ['rate_limiter', 'RateLimit'],
};
const specs = new Map();

function spec(contract) {
  if (!specs.has(contract)) {
    specs.set(contract, JSON.parse(readFileSync(resolve(root, `contracts/specs/${contract}.json`), 'utf8')));
  }
  return specs.get(contract);
}

function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}

function checkValue(value, type, entries, path) {
  if (typeof type === 'string') {
    if (['address', 'string', 'symbol'].includes(type)) {
      if (typeof value !== 'string' || !value) fail(path, `expected ${type} string`);
    } else if (type === 'bool') {
      if (typeof value !== 'boolean') fail(path, 'expected boolean');
    } else if (type === 'u32') {
      if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) fail(path, 'expected u32 number');
    } else if (['u64', 'u128', 'i64', 'i128'].includes(type)) {
      if (typeof value !== 'string' || !/^-?\d+$/.test(value)) fail(path, `expected decimal ${type} string`);
      const bits = BigInt(type.slice(1));
      const number = BigInt(value);
      const min = type.startsWith('u') ? 0n : -(1n << (bits - 1n));
      const max = type.startsWith('u') ? (1n << bits) - 1n : (1n << (bits - 1n)) - 1n;
      if (number < min || number > max) fail(path, `outside ${type} range`);
    } else if (type === 'bytes') {
      if (typeof value !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) fail(path, 'expected hex bytes');
    } else {
      fail(path, `unsupported spec type ${type}`);
    }
    return;
  }
  if ('option' in type) {
    if (value !== null) checkValue(value, type.option.value_type, entries, path);
  } else if ('bytes_n' in type) {
    if (typeof value !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value) || (value.length - 2) / 2 !== type.bytes_n.n) {
      fail(path, `expected ${type.bytes_n.n} hex bytes`);
    }
  } else if ('vec' in type) {
    if (!Array.isArray(value)) fail(path, 'expected array');
    value.forEach((item, index) => checkValue(item, type.vec.element_type, entries, `${path}[${index}]`));
  } else if ('udt' in type) {
    const union = entries.find((entry) => entry.udt_union_v0?.name === type.udt.name)?.udt_union_v0;
    if (!union) fail(path, `unsupported UDT ${type.udt.name}`);
    const variants = union.cases.map((item) => item.void_v0?.name);
    if (!Array.isArray(value) || value.length !== 1 || !variants.includes(value[0])) {
      fail(path, `expected one of ${variants.join(', ')}`);
    }
  } else {
    fail(path, `unsupported spec type ${JSON.stringify(type)}`);
  }
}

const expectedMethods = Object.keys(responses).sort();
if (JSON.stringify(Object.keys(fixtures).sort()) !== JSON.stringify(expectedMethods)) {
  fail('fixtures', `expected exactly ${expectedMethods.join(', ')}`);
}
for (const [method, [contract, name]] of Object.entries(responses)) {
  const entries = spec(contract);
  const struct = entries.find((entry) => entry.udt_struct_v0?.name === name)?.udt_struct_v0;
  if (!struct) fail(method, `missing ${contract}.${name} spec`);
  const actual = fixtures[method];
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) fail(method, 'expected struct object');
  const expected = struct.fields.map((field) => field.name).sort();
  const keys = Object.keys(actual).sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    fail(method, `fixture fields ${keys.join(', ')} do not match ${contract}.${name} fields ${expected.join(', ')}`);
  }
  for (const field of struct.fields) checkValue(actual[field.name], field.type_, entries, `${method}.${field.name}`);
}
console.log('Contract response fixtures match the committed contract specs.');
