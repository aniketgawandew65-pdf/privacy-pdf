import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import ts from 'typescript';

const KEY = 'oneintoone_daily_usage';
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const usageCode = compile(process.env.CREDIT_USAGE_SOURCE || new URL('../src/utils/usageTracker.ts', import.meta.url));
const storageCode = compile(new URL('../src/utils/safeStorage.ts', import.meta.url));
function session({ localMode = 'ok', sessionMode = 'ok', local = new Map(), tab = new Map() } = {}) {
  let today = '2026-09-16T12:00:00';
  let pro = false;
  const storage = (map, mode) => ({
    getItem(key) { if (mode === 'denied') throw new Error('SecurityError'); return map.get(key) ?? null; },
    setItem(key,value) { if (mode !== 'ok') throw new Error('QuotaExceededError'); map.set(key,value); },
    removeItem(key) { if (mode !== 'ok') throw new Error('SecurityError'); map.delete(key); },
  });
  const reload = () => {
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [today])); } }
    const globals = { localStorage: storage(local,localMode), sessionStorage: storage(tab,sessionMode), Date: Clock };
    const safe = { exports: {} };
    vm.runInNewContext(storageCode,{...globals,exports:safe.exports});
    const usage = { exports: {} };
    vm.runInNewContext(usageCode,{...globals,exports:usage.exports,require: name => name === './safeStorage' ? safe.exports : {getLicenseStatus:()=>({isPro:pro})}});
    return usage.exports;
  };
  return {reload,local,tab,setDay: value=>{today=value;},setPro: value=>{pro=value;}};
}
for (const localMode of ['ok','quota','denied']) {
  test(`${localMode}: 4→3→2→1→0 persists through fresh module/page initialization`, () => {
    const s=session({localMode});let api=s.reload();
    assert.equal(api.getDailyUsage().remaining,4);
    for(let remaining=3;remaining>=0;remaining--) {
      assert.equal(api.checkActionAllowed().allowed,true);
      api.recordActionExecution();
      assert.equal(api.getDailyUsage().remaining,remaining);
      api=s.reload(); // Both safeStorage memory maps and usage module memory are gone.
      assert.equal(api.getDailyUsage().remaining,remaining);
      api=s.reload();
      assert.equal(api.getDailyUsage().remaining,remaining);
    }
    assert.equal(api.checkActionAllowed().reason,'DAILY_LIMIT');
  });
}
test('localStorage failure with stale readable data never resets a newer session count',()=>{
  const local=new Map([[KEY,JSON.stringify({date:'2026-09-16',count:1})]]);
  const s=session({localMode:'quota',local});let api=s.reload();
  api.recordActionExecution();assert.equal(api.getDailyUsage().remaining,2);
  api=s.reload();assert.equal(api.getDailyUsage().remaining,2);
  api.recordActionExecution();api=s.reload();assert.equal(api.getDailyUsage().remaining,1);
});
test('existing normal-browser usage migrates into the session backup',()=>{
  const s=session();s.local.set(KEY,JSON.stringify({date:'2026-09-16',count:4}));
  assert.equal(s.reload().getDailyUsage().remaining,0);
  assert.equal(JSON.parse(s.tab.get(KEY)).count,4);
  s.local.clear();assert.equal(s.reload().getDailyUsage().remaining,0);
});
test('a newer normal-browser tab count wins over a stale session backup',()=>{
  const s=session();const api=s.reload();api.recordActionExecution();
  s.local.set(KEY,JSON.stringify({date:'2026-09-16',count:4}));
  assert.equal(api.getDailyUsage().remaining,0);
  assert.equal(s.reload().checkActionAllowed().allowed,false);
});
test('blocked sessionStorage does not weaken normal localStorage persistence',()=>{
  const s=session({sessionMode:'denied'});let api=s.reload();
  for(let i=0;i<4;i++)api.recordActionExecution();
  api=s.reload();assert.equal(api.getDailyUsage().remaining,0);
});
test('existing daily reset and next-day decrement remain unchanged',()=>{
  const s=session({localMode:'denied'});let api=s.reload();
  for(let i=0;i<4;i++)api.recordActionExecution();
  s.setDay('2026-09-17T12:00:00');api=s.reload();
  assert.equal(api.getDailyUsage().remaining,4);
  api.recordActionExecution();assert.equal(s.reload().getDailyUsage().remaining,3);
});
test('Pro bypass and file-size rules remain unchanged',()=>{
  const s=session();const api=s.reload();api.recordActionExecution();s.setPro(true);
  api.recordActionExecution();assert.equal(api.getDailyUsage().remaining,Infinity);
  assert.equal(api.checkActionAllowed(150*1024*1024).allowed,true);
  assert.equal(api.checkActionAllowed(151*1024*1024).reason,'FILE_SIZE_LIMIT');
  s.setPro(false);assert.equal(api.getDailyUsage().remaining,3);
  assert.equal(api.checkActionAllowed(25*1024*1024).allowed,true);
  assert.equal(api.checkActionAllowed(26*1024*1024).reason,'FILE_SIZE_LIMIT');
});
test('malformed primary record cannot hide an intact zero-credit session backup',()=>{
  const s=session();s.local.set(KEY,'bad json');s.tab.set(KEY,JSON.stringify({date:'2026-09-16',count:4}));
  assert.equal(s.reload().getDailyUsage().remaining,0);
});
