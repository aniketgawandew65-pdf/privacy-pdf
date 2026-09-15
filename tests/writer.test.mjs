import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import ts from 'typescript';
const source = ts.transpileModule(await fs.readFile(new URL('../src/workers/opfsPdfStreamWriter.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(mode, durable = new Uint8Array(), failFlush = false) {
  let working = durable.slice(), persisted = durable.slice();
  const messages = new Map(); let serial = 0; let cursor = 0;
  const resize = (bytes, size) => { const next = new Uint8Array(size); next.set(bytes.subarray(0, size)); return next; };
  const append = (bytes, at) => { working = resize(working, Math.max(working.length, at + bytes.length)); working.set(bytes, at); };
  const handle = {
    getFile: async () => ({ size: persisted.length }),
    createWritable: async ({ keepExistingData } = {}) => {
      working = keepExistingData ? persisted.slice() : new Uint8Array(); cursor = 0;
      return {
        truncate: async size => { working = resize(working, size); }, seek: async at => { cursor = at; },
        write: async bytes => { append(bytes, cursor); cursor += bytes.length; },
        close: async () => { if (failFlush) throw new Error('disk full'); persisted = working.slice(); },
        abort: async () => { working = persisted.slice(); },
      };
    },
  };
  if (mode === 'sync') handle.createSyncAccessHandle = async () => ({
    getSize: () => persisted.length,
    truncate: size => { working = resize(working,size); },
    write: (bytes, { at }) => { const part = bytes.subarray(0, 2); append(part, at); return part.length; },
    flush: () => { if (failFlush) throw new Error('disk full'); persisted = working.slice(); },
    close: () => {},
  });
  const scope = { navigator: { storage: { getDirectory: async () => ({ getDirectoryHandle: async () => ({ getFileHandle: async () => handle }) }) } },
    postMessage: msg => messages.get(msg.requestId)(msg) };
  vm.runInNewContext(source, { self: scope, exports: {}, Uint8Array, Promise, Number, Error });
  return { persisted: () => [...persisted], request: (type, data = {}) => new Promise(resolve => {
    const requestId = String(++serial); messages.set(requestId, resolve); scope.onmessage({ data: { requestId, type, ...data } });
  }) };
}
for (const mode of ['sync','async']) {
  test(`${mode}: commit persists bytes, resume truncates partial tail`, async () => {
    const h = harness(mode, Uint8Array.from([1,2,88,99]));
    assert.equal((await h.request('init', { directoryName:'test', fileName:'out', truncateTo:2 })).ok,true);
    await h.request('append', { data: Uint8Array.from([3,4,5,6,7]).buffer });
    assert.equal((await h.request('commit')).ok,true);
    assert.deepEqual(h.persisted(),[1,2,3,4,5,6,7]);
    await h.request('append', { data: Uint8Array.from([8,9]).buffer });
    await h.request('abort');
    assert.deepEqual(h.persisted(),[1,2,3,4,5,6,7]);
  });
  test(`${mode}: never acknowledges failed commit`, async () => {
    const h=harness(mode,new Uint8Array(),true);
    await h.request('init',{directoryName:'test',fileName:'out',truncateTo:0});
    await h.request('append',{data:Uint8Array.from([1,2]).buffer});
    assert.equal((await h.request('commit')).ok,false);
    assert.deepEqual(h.persisted(),[]);
  });
  test(`${mode}: refuses checkpoint beyond durable file`, async () => {
    const h=harness(mode,Uint8Array.from([1]));
    assert.equal((await h.request('init',{directoryName:'test',fileName:'out',truncateTo:10})).ok,false);
  });
}
