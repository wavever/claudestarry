import test from 'node:test';
import assert from 'node:assert/strict';
import { accountStarSizeScale, brightness, CLAUDE_EPOCH, dateToDay, dayToDate, MIN_LIGHT, HALF_LIFE, validAccount, mergeAccounts, loadAccounts, galaxyPosition } from './model.js';
import { BASELINE, HISTORY_LEVELS, historyLevel } from './baseline.js';
test('optional attribution survives local persistence and old records remain readable', () => {
  const old = { id: 'MY-old', alias: 'old', date: '2020-01-02', message: '' };
  const added = { id: 'MY-new', alias: 'new', date: '2026-01-02', message: '', owner: '  小明  ' };
  const records = mergeAccounts([old], [added], dateToDay('2026-11-03'), null);
  assert.equal(records[0].owner, null);
  assert.equal(records[1].owner, '小明');
  const reloaded = loadAccounts({ getItem: () => JSON.stringify(records) }, dateToDay('2026-11-03'));
  assert.equal(reloaded[1].owner, '小明');
  for (const owner of [42, 'x'.repeat(33), 'bad\nname']) {
    assert.equal(validAccount({ ...added, owner }, dateToDay('2026-11-03')), false);
  }
  assert.equal(validAccount({ ...added, owner: '✨'.repeat(32) }, dateToDay('2026-11-03')), true);
});
test('light declines monotonically, halves excess light every 120 days and retains a floor', () => {
  assert.equal(brightness(0),1);
  assert.equal(brightness(-1),0);
  assert.ok(Math.abs(brightness(HALF_LIFE) - (MIN_LIGHT + (1-MIN_LIGHT)/2)) < 1e-12);
  for(let age=0;age<10000;age++) assert.ok(brightness(age+1)<=brightness(age) && brightness(age)>=MIN_LIGHT);
});
test('date validation rejects impossible dates, future dates and malformed storage', () => {
  assert.ok(Number.isNaN(dateToDay('2026-02-30')));
  const now=dateToDay('2026-10-29');
  assert.equal(dayToDate(now),'2026-10-29');
  const good={id:'mine',alias:'my star',date:'2026-10-28',message:'hello'};
  assert.ok(validAccount(good,now));
  assert.ok(!validAccount({...good,date:'2026-10-30'},now));
  assert.ok(!validAccount({...good,alias:'  '},now));
  // Claude epoch 2021-01-26
  assert.ok(validAccount({...good,date:'2021-01-26'},now));
  assert.ok(!validAccount({...good,date:'2021-01-25'},now));
  assert.ok(!validAccount({...good,started:'2021-01-25',date:'2022-01-01'},now));
  assert.ok(validAccount({...good,started:'2021-01-26',date:'2022-01-01'},now));
  // Empty story or omitted started are both valid
  assert.ok(validAccount({...good,message:''},now));
  assert.ok(validAccount({id:'mine2',alias:'star',date:'2024-05-01',started:null,message:''},now));
  const historical={...good,id:'legacy-local',date:'2021-01-25'};
  const result=loadAccounts({getItem:()=>JSON.stringify([good,historical,{...good,id:'invalid',date:'bad'}])},now);
  assert.equal(result.length,2); assert.equal(result.find(account=>account.id==='legacy-local')?.date,'2021-01-25');
  assert.ok(result.every(account=>account.sample===false));
  // Legacy display/import paths retain old records without weakening the
  // normal merge default used by unvalidated callers.
  assert.equal(mergeAccounts([], [historical], now).length,0);
  assert.deepEqual(mergeAccounts([historical], [good], now, null).map(account=>account.id),['legacy-local','mine']);
});

test('account-star size follows online duration, then a disabled-date fallback', () => {
  const referenceDay=dateToDay('2026-10-31');
  const short={started:'2026-10-30',date:'2026-10-30'};
  const long={started:CLAUDE_EPOCH,date:'2026-10-30'};
  const fallbackEarly={date:CLAUDE_EPOCH};
  const fallbackLater={date:'2024-10-30'};
  assert.equal(accountStarSizeScale(short,referenceDay),0);
  assert.ok(accountStarSizeScale(long,referenceDay)>accountStarSizeScale(short,referenceDay));
  assert.equal(accountStarSizeScale(fallbackEarly,referenceDay),0);
  assert.ok(accountStarSizeScale(fallbackLater,referenceDay)>accountStarSizeScale(fallbackEarly,referenceDay));
  assert.ok(accountStarSizeScale(long,referenceDay)<=1);
});
test('every historical LOD represents the same source total without inventing identities or dates', () => {
  assert.equal(BASELINE.accounts,11_400_000);
  assert.equal(BASELINE.precision,'rounded');
  assert.equal(BASELINE.hasIndividualRecords,false);
  for(const lod of HISTORY_LEVELS)assert.equal(lod.points*lod.accountsPerPoint,BASELINE.accounts);
  assert.ok(historyLevel(15).points>historyLevel(50).points);
  assert.ok(historyLevel(50,true).points<historyLevel(50,false).points);
});
test('one stable record ID yields one star even when an event is replayed or updated', () => {
  assert.deepEqual(galaxyPosition(123),galaxyPosition(123));
  const now=dateToDay('2026-10-29');
  const first={id:'record-1',alias:'A',message:'first message',date:'2026-05-01'};
  const initial=mergeAccounts([],[first],now);
  const replayed=mergeAccounts(initial,[first,{...first,message:'updated'}],now);
  assert.equal(replayed.length,1);
  assert.equal(replayed[0].message,'updated');
  assert.deepEqual(replayed[0].position,initial[0].position);
  const second=mergeAccounts(replayed,[{...first,id:'record-2'}],now);
  assert.equal(second.length,2);
  assert.notDeepEqual(second[0].position,second[1].position);
  // A historical-period submission remains a record, not a change to the aggregate.
  assert.equal(BASELINE.accounts,11_400_000);
});

test('account lifetime controls initial light and decay while legacy records remain valid', async () => {
 const {starProfile,accountBrightness}=await import('./model.js');
 const short={date:'2026-10-01',started:'2026-09-30'};
 const long={date:'2026-10-01',started:'2025-10-01'};
 assert.ok(starProfile(long).peak>starProfile(short).peak);
 assert.ok(starProfile(long).halfLife>starProfile(short).halfLife);
 const day=dateToDay(short.date);
 assert.ok(accountBrightness(long,day+120)>accountBrightness(short,day+120));
 assert.ok(accountBrightness(short,day+99999)>=MIN_LIGHT);
 assert.equal(accountBrightness(short,day-1),0);
 const legacy={id:'old',alias:'old',date:'2026-10-01',message:'memory'};
 assert.ok(validAccount(legacy));
 assert.equal(accountBrightness(legacy,day+120),brightness(120));
 assert.ok(!validAccount({...legacy,started:'2026-10-02'}));
 assert.ok(!validAccount({...legacy,started:'2026-02-30'}));
 assert.equal(mergeAccounts([],[{...legacy,started:'2025-01-01'}])[0].started,'2025-01-01');
});


test('catalog numbers survive replay and reload, migrate legacy records, and resolve duplicates', async () => {
  const {catalogDesignation,nextCatalogNumber}=await import('./model.js');
  const a={id:'a',alias:'A',date:'2026-10-28',message:'light'};
  const first=mergeAccounts([],[a,{...a,id:'b'}]);
  assert.deepEqual(first.map(a=>a.catalogNumber),[1,2]);
  assert.equal(catalogDesignation(first[0]),'AL 000001');
  const replay=mergeAccounts(first,[{...a,message:'updated'}]);
  assert.equal(replay[0].catalogNumber,1);
  const restored=loadAccounts({getItem:()=>JSON.stringify(replay)});
  assert.deepEqual(restored.map(a=>a.catalogNumber),[1,2]);
  const third=mergeAccounts(restored,[{...a,id:'c',catalogNumber:1}]);
  assert.deepEqual(third.map(a=>a.catalogNumber),[1,2,3]);
  assert.equal(nextCatalogNumber(third),4);
});
