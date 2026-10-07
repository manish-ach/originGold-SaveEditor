import test from 'node:test';
import assert from 'node:assert/strict';
import {createPokemon, emptyPartyRecord, decodePokemon, patchPokemonSpecies} from '../dist/core/pokemon.js';
import {loadBundledOriginData} from '../dist/core/bundled-data.js';
import {speciesInfo} from '../dist/core/species-info.js';
import {crc16, readSave, patchPartyRecord} from '../dist/core/save.js';
import {fillBag, POCKETS, readInventory, patchInventoryPocket} from '../dist/core/inventory.js';
const data = loadBundledOriginData();
function fixture() {
 const bytes = new Uint8Array(0x80000), dv = new DataView(bytes.buffer);
 for (const base of [0, 0x40000]) {
  dv.setUint32(base + 0x90, 6, true); dv.setUint32(base + 0x94, 1, true);
  const footer = base + 0xf7cc - 16;
  dv.setUint32(footer, base ? 1 : 2, true); dv.setUint32(footer + 4, 0xf7cc, true);
  dv.setUint32(footer + 8, 0x20060623, true);
  dv.setUint16(footer + 14, crc16(bytes.subarray(base, footer)), true);
 }
 return bytes;
}
const ivs = {hp:31, attack:20, defense:19, speed:18, spAttack:17, spDefense:16};
function pokemon() {
 const info = speciesInfo(1, 0);
 return createPokemon(emptyPartyRecord(), {speciesId:1, level:50, nature:3, shiny:true,
  gender:'male', ability:info.abilities[0], abilitySlot:0, ivs, moves:[{id:33,pp:35}], name:'Bulbasaur',
  genderRatio:info.genderRatio, baseFriendship:info.baseFriendship, personal:data.getPersonal(1,0)});
}
for (const size of [136,236]) test(`species change preserves identity and training (${size})`, () => {
 const record = pokemon().slice(0,size), before = decodePokemon(record);
 const changed = patchPokemonSpecies(record,445,'Garchomp',data.getPersonal(445,0),data.getPersonal(1,0).growthThresholds,speciesInfo(445,0).genderRatio);
 const after = decodePokemon(changed);
 assert.equal(after.speciesId,445); assert.equal(after.form,0); assert.equal(after.nickname,'Garchomp');
 for (const key of ['pid','tid','sid','otName','ivs','evs','nature','shiny','moves','heldItem','ability','abilitySlot','pokerus']) assert.deepEqual(after[key],before[key]);
 assert.equal(after.experience,data.getPersonal(445,0).growthThresholds[50]);
 if (size===236) { assert.equal(after.party.level,50); assert.notDeepEqual(after.party.stats,before.party.stats); }
 assert.deepEqual(decodePokemon(record),before);
 assert.deepEqual(patchPokemonSpecies(record,1,'Bulbasaur',data.getPersonal(1,0),data.getPersonal(1,0).growthThresholds,31),record);
 assert.throws(()=>patchPokemonSpecies(record,0,'Bad',data.getPersonal(1,0),[],31));
 const save = patchPartyRecord(fixture(),0,pokemon());
 const result = patchPartyRecord(save,0,changed.length===236?changed:patchPokemonSpecies(pokemon(),445,'Garchomp',data.getPersonal(445,0),data.getPersonal(1,0).growthThresholds,speciesInfo(445,0).genderRatio));
 assert.equal(decodePokemon(readSave(result).partyRecords[0]).speciesId,445);
});
test('fill bag respects capacity, quantity limits, existing items and key item bytes', () => {
 const key=data.inventory.items.find(i=>i.pocket==='keyItems');
 const existing=data.inventory.items.filter(i=>i.pocket==='items'&&!i.name.startsWith('Item #')).at(-1);
 let input=patchInventoryPocket(fixture(),'keyItems',[{id:key.id,quantity:1}],data.inventory);
 input=patchInventoryPocket(input,'items',[{id:existing.id,quantity:2}],data.inventory);
 const before=input.slice(), result=fillBag(input,data.inventory), inv=readInventory(result.bytes);
 assert.ok(result.omitted>0); assert.deepEqual(input,before);
 assert.deepEqual(inv.pockets.keyItems,[{id:key.id,quantity:1}]);
 const kp=POCKETS.find(p=>p.id==='keyItems'), base=readSave(input).generalOffset;
 assert.deepEqual(result.bytes.slice(base+kp.offset,base+kp.offset+kp.capacity*4),input.slice(base+kp.offset,base+kp.offset+kp.capacity*4));
 for (const p of POCKETS.filter(p=>p.id!=='keyItems')) {
  assert.ok(inv.pockets[p.id].length<=p.capacity);
  assert.ok(inv.pockets[p.id].every(i=>i.quantity===p.maxQuantity));
 }
 assert.ok(inv.pockets.items.some(i=>i.id===existing.id));
 assert.deepEqual(fillBag(result.bytes,data.inventory).bytes,result.bytes);
});
