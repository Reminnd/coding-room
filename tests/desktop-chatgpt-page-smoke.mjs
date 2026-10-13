import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import adapter from '../desktop/electron/chatgpt-page.cjs';

const root = mkdtempSync(join(tmpdir(), 'room-composer-text-'));
const main = join(root, 'main.cjs');
writeFileSync(main, `const {app,BrowserWindow}=require('electron');app.setPath('userData',process.env.ROOM_USER_DATA);app.whenReady().then(()=>{const w=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true}});w.loadURL('about:blank');});`);
const app = await electron.launch({args:[main],env:{...process.env,ROOM_USER_DATA:root}});
try {
  const page = await app.firstWindow();
  await page.setContent('<main><div class="MarkdownRoot-rZKhxa rich-text-user-turn"><p>用户消息</p></div><div class="MarkdownRoot-rZKhxa"><p>方案正文</p><div class="CodeBlock-zu1QM3"><div class="InlineCodePane-EYx4bd"><code class="CodeContent-ybJ8Tl">{"room_questions":[]}</code></div></div><div class="CodeBlock-zu1QM3"><pre><code>{"room_task":{"scope":["src"]}}</code></pre></div></div></main>');
  const modern = await page.evaluate(source=>(0,eval)('('+source+')')('read'),adapter.chatgptPage.toString());
  assert.equal(modern.messages.length,2,'Actual signed-in MarkdownRoot messages must be recognized');
  assert.deepEqual(modern.messages.map(message=>message.role),['user','assistant']);
  assert.equal(modern.messages[0].text,'用户消息');
  assert.match(modern.messages[1].text,/```json\n\{"room_task"/);
  assert.match(modern.messages[1].text,/```json\n\{"room_questions"/);
  await page.setContent('<main><div class="MarkdownRoot-rZKhxa rich-text-user-turn"><p>[Room task context]\nContext</p><span class="block whitespace-pre-wrap">\n</span><p>[Room user message]\nA、A、A</p></div></main>');
  const answer = await page.evaluate(source=>(0,eval)('('+source+')')('read'),adapter.chatgptPage.toString());
  assert.equal(answer.messages[0].text,'A、A、A','Read the entire user message, not its blank whitespace span');
  const expected = '[Room task context]\nContext\n\n[Room user message]\n代码：\n  first()\n\n  second()';
  for (const tag of ['p', 'div']) {
    await page.setContent('<div role="textbox" aria-label="询问 ChatGPT" contenteditable="true" style="white-space:pre-wrap"></div><button aria-label="发送">Send</button>');
    await page.evaluate(({text,tag})=>{
      const editor=document.querySelector('[contenteditable]');
      editor.replaceChildren(...text.split('\n').map(line=>{
        const block=document.createElement(tag);
        if(line)block.textContent=line;else block.innerHTML='<br class="ProseMirror-trailingBreak">';
        return block;
      }));
      document.querySelector('button').onclick=()=>{window.sent=(window.sent??0)+1;};
      window.sent=0;
    },{text:expected,tag});
    const call = (action,text) => page.evaluate(({source,action,text})=>(0,eval)('('+source+')')(action,text),{source:adapter.chatgptPage.toString(),action,text});
    const diagnostic = await call('diagnose','');
    assert.ok(diagnostic.messageStructure.some(node=>node.role==='textbox'));
    assert.ok(diagnostic.messageStructure.every(node=>!('text' in node)&&!('raw' in node)));
    assert.equal(await call('focus',expected),'reuse',`${tag}: complete draft must be reusable`);
    assert.equal(await call('send',expected),true,`${tag}: complete draft must send`);
    assert.equal(await page.evaluate(()=>window.sent),1);
    for(const changed of [expected+' missing',expected.replace('  first()',' first()'),expected.replace('first()\n\n','first()\n')]) {
      await assert.rejects(call('send',changed),/网页输入内容未完整写入/,'Missing text, indentation and real blank lines must remain detectable');
    }
    assert.equal(await page.evaluate(()=>window.sent),1,'Invalid content must never click send');
  }
  console.log('PASS: paragraph and div editors preserve text, indentation and blank lines.');
} finally { await app.close(); }
