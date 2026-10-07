import test from 'node:test';
import assert from 'node:assert/strict';
import {crc16, readSave} from '../dist/core/save.js';
import {patchBadge, readTrainer} from '../dist/core/trainer.js';
function fixture(base = 0) {
  const bytes = new Uint8Array(0x80000), dv = new DataView(bytes.buffer);
  for (const offset of [0, 0x40000]) {
    dv.setUint32(offset + 0x90, 6, true);
    bytes[offset + 0x7e] = 0x55; bytes[offset + 0x83] = 0xaa;
    const footer = offset + 0xf7cc - 16;
    dv.setUint32(footer, offset === base ? 2 : 1, true);
    dv.setUint32(footer + 4, 0xf7cc, true);
    dv.setUint32(footer + 8, 0x20060623, true);
    dv.setUint16(footer + 14, crc16(bytes.subarray(offset, footer)), true);
  }
  return bytes;
}
for (const base of [0, 0x40000]) test(`all badge bits preserve unrelated data, active mirror ${base}`, () => {
  const input = fixture(base);
  for (let bank = 0; bank < 2; bank++) for (let bit = 0; bit < 8; bit++) {
    const before = readTrainer(input), earned = !(before.badges[bank] & (1 << bit));
    const output = patchBadge(input, bank, bit, earned);
    assert.equal(readSave(output).generalOffset, base);
    const expected = [...before.badges]; expected[bank] ^= 1 << bit;
    assert.deepEqual(readTrainer(output).badges, expected);
    assert.equal(readTrainer(output).badgeCount, before.badgeCount + (earned ? 1 : -1));
    assert.deepEqual(patchBadge(output, bank, bit, !earned), input);
    assert.deepEqual(patchBadge(output, bank, bit, earned), output);
    const allowed = new Set([base + (bank === 0 ? 0x7e : 0x83), base + 0xf7cc - 2, base + 0xf7cc - 1]);
    for (let i = 0; i < input.length; i++) if (output[i] !== input[i]) assert.ok(allowed.has(i), `unexpected change at ${i}`);
  }
  assert.deepEqual(input, fixture(base));
});
test('invalid badge arguments rejected', () => {
  for (const args of [[-1, 0, true], [2, 0, true], [0.5, 0, true], [0, -1, true], [0, 8, true], [0, NaN, true], [0, 0, 1]]) assert.throws(() => patchBadge(fixture(), ...args));
});
test('equal-counter mirrors allow no-op and reject edits', () => {
  const bytes = fixture(); bytes.set(bytes.subarray(0, 0xf7cc), 0x40000);
  assert.equal(readSave(bytes).tied, true);
  assert.deepEqual(patchBadge(bytes, 0, 0, true), bytes);
  assert.throws(() => patchBadge(bytes, 0, 0, false));
});
