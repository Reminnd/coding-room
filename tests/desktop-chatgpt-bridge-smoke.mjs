import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// This fixture tests DOM transport, not authenticated ChatGPT inference.
const fixture = `<!doctype html><html><head><meta charset="utf-8"></head><body><button id="login">登录</button><main></main>
<textarea id="chat-composer" aria-label="Message ChatGPT" disabled></textarea><button data-testid="send-button" disabled>发送</button>
<script>
let input=document.querySelector('textarea');const send=document.querySelector('[data-testid="send-button"]'), main=document.querySelector('main');
main.innerHTML=sessionStorage.getItem(location.pathname)||'';
function login(){document.querySelector('#login')?.remove();input.disabled=false;send.disabled=false;localStorage.setItem('fixture-login','yes');}
document.querySelector('#login').onclick=login;if(localStorage.getItem('fixture-login'))login();
send.onclick=()=>{
 window.lastSent=input.value??(input.dataset.paragraphs ? [...input.children].map(p=>p.textContent).join('\\n') : input.innerText);if(location.pathname==='/')history.pushState({},'', '/c/'+crypto.randomUUID());
 const user=document.createElement('div');user.className='MarkdownRoot-rZKhxa rich-text-user-turn';
 for(const line of window.lastSent.split('\\n')){const p=document.createElement('p');p.textContent=line;user.append(p);}
 const delayed=window.lastSent.endsWith('第二个任务的消息');
 if(delayed)user.textContent='折叠后的用户消息';
 main.append(user);if(input.tagName==='TEXTAREA')input.value='';else input.textContent='';send.disabled=true;
 const stop=document.createElement('button');stop.setAttribute('aria-label','停止');stop.textContent='Stop';document.body.append(stop);
 const reply=document.createElement('div');reply.className='MarkdownRoot-rZKhxa';main.append(reply);
 if(delayed)setTimeout(()=>main.querySelectorAll('[data-history]').forEach(node=>node.remove()),9000);
 const stream=setTimeout(()=>{reply.innerHTML='<div class="markdown"><p>正在整理规格…</p></div>';},delayed?10000:900);
 const timer=setTimeout(()=>{
 reply.innerHTML='<div class="markdown"><h2>Bridge proposal</h2><p>Keep execution behind confirmation.</p><div class="CodeBlock-zu1QM3"><div class="InlineCodePane-EYx4bd"><code class="CodeContent-ybJ8Tl"></code></div></div></div>';
 reply.querySelector('code').textContent=JSON.stringify({room_task:{requirements:['Keep confirmation'],non_goals:[],architecture_decisions:[],scope:['src'],constraints:[],acceptance_criteria:['No automatic execution'],verification:[],documentation_updates:[],question_policy:'Ask when unclear',sdd:{specification:'Task spec',technical_design:'Keep existing execution',tasks:[]}}});
 if(window.lastSent.endsWith('请形成规格与方案'))reply.querySelector('code').textContent=JSON.stringify({room_questions:[{id:'scope',question:'需要哪种使用范围？',options:[{label:'本地单人（推荐）',description:'只在本机使用'},{label:'多人共享',description:'跨用户协作'}]}]});
 stop.remove();send.disabled=false;sessionStorage.setItem(location.pathname,main.innerHTML);},delayed?12000:1800);
 stop.onclick=()=>{clearTimeout(timer);clearTimeout(stream);stop.remove();send.disabled=false;};
};</script></body></html>`;
const root=mkdtempSync(join(tmpdir(),'room-chatgpt-bridge-'));
const project=join(root,'project');mkdirSync(project);
let instance, processHandle;
try {
 instance=await electron.launch({...(process.env.ROOM_TEST_EXECUTABLE?{executablePath:process.env.ROOM_TEST_EXECUTABLE,args:[]}:{args:['.']}),env:{...process.env,ROOM_USER_DATA:join(root,'profile')},timeout:60000});
 processHandle=instance.process();
 const page=await instance.firstWindow();page.setDefaultTimeout(15000);
 await page.getByRole('heading',{name:'从一个项目开始'}).waitFor();
 await instance.evaluate(({dialog,session},{project,fixture})=>{
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});
  session.fromPartition('persist:room-chatgpt').protocol.handle('https',()=>new Response(fixture,{headers:{'content-type':'text/html'}}));
 },{project,fixture});
 await page.getByRole('button',{name:'打开项目文件夹'}).click();
 await page.getByRole('button',{name:'为此项目创建 Room',exact:true}).click();
 await page.getByRole('heading',{name:'全部任务',exact:true}).waitFor();
 await page.getByRole('button',{name:'＋ 新建任务'}).click();
 await page.getByLabel('任务标题',{exact:true}).fill('ChatGPT bridge');
 await page.getByLabel('希望完成什么').fill('Discuss inside Electron');
 await page.getByRole('radio',{name:/规格模式/}).check();
 await page.getByRole('button',{name:'开始讨论',exact:true}).click();
 const input=page.getByRole('textbox',{name:'讨论内容',exact:true});
 await input.fill('请形成规格与方案');
 await page.getByText('请登录 ChatGPT 后继续讨论',{exact:true}).waitFor();
 await page.getByRole('button',{name:'打开网页 / 登录',exact:true}).click();
 await instance.evaluate(async({webContents})=>{
  const remote=webContents.getAllWebContents().find(w=>w.getURL()==='https://chatgpt.com/');
  const isolated=await remote.executeJavaScript('({require:typeof require,bridge:typeof window.roomDesktop})');
  if(isolated.require!=='undefined'||isolated.bridge!=='undefined')throw new Error('Remote page has Room privileges');
  await remote.executeJavaScript('document.getElementById("login").click()');
 });
 const toolbar=instance.windows().find(w=>w.url().includes('chatgpt-toolbar'));
 const windowState=await instance.evaluate(({BrowserWindow})=>{
  const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('chatgpt-toolbar'));
  return {independent:win.getParentWindow()===null,modal:win.isModal()};
 });
 const bridgeReady=await page.evaluate(async()=>{
  const {projects}=await(await fetch('/api/projects')).json();const id=projects[0].project_id;
  const {tasks}=await(await fetch('/api/projects/'+id+'/workbench/tasks')).json();
  return (await window.roomDesktop.chatgpt(id,tasks[0].id,'read')).ready;
 });
 assert.deepEqual({...windowState,ready:bridgeReady},{independent:true,modal:false,ready:true},'Chat window must be independent and recognize the editable composer without a fixed DOM id');
 await toolbar.getByRole('button',{name:'保存页面诊断',exact:true}).click();
 await toolbar.getByRole('status').filter({hasText:'页面控件诊断已保存'}).waitFor();
 const diagnostic=JSON.parse(readFileSync(join(root,'profile','chatgpt-page-diagnostic.json'),'utf8'));
 assert.equal(diagnostic.selectedEditor.id,'chat-composer');
 assert.ok(diagnostic.controls.every(control=>!('value' in control)&&!('text' in control)));
 await instance.evaluate(async({BrowserWindow})=>{
  const chat=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('chatgpt-toolbar'));
  const room=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('http://127.0.0.1'));
  const minimize=async win=>{const event=new Promise(resolve=>win.once('minimize',resolve));win.minimize();await event;};
  await minimize(chat);if(room.isMinimized())throw new Error('Chat minimized Room');chat.restore();
  await minimize(room);if(chat.isMinimized())throw new Error('Room minimized Chat');room.restore();
 });
 await toolbar.getByRole('button',{name:'返回 Room'}).click();
 assert.equal(await input.inputValue(),'请形成规格与方案');
 await instance.evaluate(async({webContents})=>{
  await webContents.getAllWebContents().find(w=>w.getURL()==='https://chatgpt.com/').executeJavaScript('send.disabled=true');
 });
 await page.getByRole('button',{name:'发送',exact:true}).click();
 await page.getByText(/网页发送按钮不可用/).waitFor();
 assert.equal(await input.inputValue(),'请形成规格与方案','Failed send must retain the Room draft');
 await instance.evaluate(async({webContents})=>{
  await webContents.getAllWebContents().find(w=>w.getURL()==='https://chatgpt.com/').executeJavaScript('send.disabled=false');
 });
 await page.getByRole('button',{name:'发送',exact:true}).click();
 await page.getByRole('status').filter({hasText:'ChatGPT 正在思考或准备回复'}).waitFor();
 await page.getByText('正在整理规格…',{exact:true}).waitFor();
 assert.equal(await input.inputValue(),'','Confirmed send must clear the Room draft');
 await page.getByRole('status').filter({hasText:'ChatGPT 正在输出'}).waitFor();
 const clarification=page.getByRole('dialog',{name:'需要你明确需求'});
 await clarification.waitFor();
 assert.equal(await page.locator('.message').filter({hasText:'"room_questions"'}).count(),0,'Transport metadata must not appear in the conversation');
 await page.screenshot({path:join(root,'clarification.png')});
 await clarification.getByRole('radio',{name:/本地单人/}).check();
 await clarification.getByRole('button',{name:'提交答案并继续'}).click();
 await page.getByRole('status').filter({hasText:'方案草稿已自动保存'}).waitFor();
 await page.getByRole('button',{name:'查看已保存方案',exact:true}).click();
 await page.getByRole('button',{name:'对话',exact:true}).click();
 const data=await page.evaluate(async()=>{
  const {projects}=await(await fetch('/api/projects')).json();const projectId=projects[0].project_id;
  const {tasks}=await(await fetch('/api/projects/'+projectId+'/workbench/tasks')).json();return {projectId,task:tasks[0]};
 });
 assert.match(data.task.proposal,/Bridge proposal/);assert.equal(data.task.proposal_details.sdd.specification,'Task spec');
 assert.equal(data.task.proposal_version,1);assert.equal(data.task.thread_id,null);assert.equal(data.task.run_id,null);assert.equal(data.task.approved_version,null);
 assert.match(data.task.chatgpt_url,/^https:\/\/chatgpt.com\/c\//);
 const sent=await instance.evaluate(async({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://chatgpt.com/c/')).executeJavaScript('window.lastSent'));
 assert.match(sent,/Discuss inside Electron/);assert.match(sent,/回答：本地单人/);assert.match(sent,/需求澄清方法/);
 assert.equal(sent.split('[Room task context]').length,2,'Retry must not duplicate the payload');
 await page.reload();await page.getByRole('button',{name:'对话',exact:true}).click();await page.getByRole('textbox',{name:'讨论内容',exact:true}).waitFor();await page.getByText('请形成规格与方案',{exact:true}).waitFor();
 assert.equal(await page.locator('.message.user').count(),2,'Reload must not resend');
 const afterReload=await page.evaluate(async({projectId,task})=>(await(await fetch('/api/projects/'+projectId+'/workbench/tasks')).json()).tasks.find(item=>item.id===task.id).proposal_version,data);
 assert.equal(afterReload,1,'Reload must not duplicate the saved proposal');
 await page.screenshot({path:join(root,'room.png')});
 await page.getByRole('button',{name:'＋ 新建任务'}).click();
 await page.getByLabel('任务标题',{exact:true}).fill('Second Chat task');
 await page.getByLabel('希望完成什么').fill('Independent discussion');
 await page.getByRole('radio',{name:/规格模式/}).check();
 await page.getByRole('button',{name:'开始讨论',exact:true}).click();
 await page.getByRole('textbox',{name:'讨论内容',exact:true}).fill('第二个任务的消息');
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='发送'&&!button.disabled));
 await instance.evaluate(async({webContents})=>{
  const remote=webContents.getAllWebContents().find(w=>w.getURL()==='https://chatgpt.com/');
  await remote.executeJavaScript(`{
    const rich=document.createElement('div');rich.contentEditable='true';rich.setAttribute('role','textbox');rich.setAttribute('aria-label','Message ChatGPT');rich.style.minHeight='40px';
    input.replaceWith(rich);input=rich;
    const search=document.createElement('textarea');search.setAttribute('aria-label','Search history');document.body.prepend(search);
    const form=document.createElement('form');document.body.append(form);form.append(input,send);send.type='button';
    send.removeAttribute('data-testid');send.setAttribute('aria-label','发送');
    input.innerText='[Room task context]\\nOld context\\n[Room user message]\\nOld Room draft';
    input.dataset.paragraphs='true';
    const oldUser=document.createElement('div');oldUser.className='MarkdownRoot-rZKhxa rich-text-user-turn';oldUser.dataset.history='true';oldUser.textContent='此前的问题';main.append(oldUser);
    const oldReply=document.createElement('div');oldReply.dataset.turn='assistant';oldReply.dataset.history='true';oldReply.textContent='此前的回复';main.append(oldReply);
    let paragraphTimer;
    input.addEventListener('input',()=>{
      clearTimeout(paragraphTimer);
      paragraphTimer=setTimeout(()=>{
        const lines=input.innerText.split('\\n');
        input.replaceChildren(...lines.map(line=>{const p=document.createElement('p');if(line)p.textContent=line;else p.append(document.createElement('br'));return p;}));
      },0);
    });
  }`);
 });
 await page.getByRole('button',{name:'发送',exact:true}).click();
 await page.getByText(/尚未确认网页发送结果/).waitFor();
 const sendDiagnostic=JSON.parse(readFileSync(join(root,'profile','chatgpt-send-diagnostic.json'),'utf8'));
 assert.ok(sendDiagnostic.messageNodes.some(node=>node.turn==='assistant'));
 assert.ok(sendDiagnostic.messageNodes.every(node=>!('text' in node)&&!('raw' in node)));
 assert.equal(await page.getByRole('textbox',{name:'讨论内容',exact:true}).inputValue(),'第二个任务的消息','Old replies must not confirm a new send');
 await page.waitForFunction(()=>document.querySelector('textarea[aria-label="讨论内容"]')?.value==='');
 assert.equal(await page.getByText(/尚未确认网页发送结果/).count(),0,'Late confirmation must clear the timeout notice');
 await page.getByRole('button',{name:'停止生成',exact:true}).click();
 await page.getByRole('button',{name:'发送',exact:true}).waitFor();
 assert.equal(await page.getByText('请形成规格与方案',{exact:true}).count(),0,'Second task must not show first task messages');
 const messages=await instance.evaluate(async({webContents})=>Promise.all(webContents.getAllWebContents().filter(w=>w.getURL().startsWith('https://chatgpt.com/c/')).map(w=>w.executeJavaScript('({url:location.href,text:window.lastSent})'))));
 assert.equal(messages.length,2);assert.notEqual(messages[0].url,messages[1].url);
 assert.equal(messages.filter(m=>m.text.includes('第二个任务的消息')).length,1);
 assert.ok(messages.every(m=>!m.text.includes('Old Room draft')),'Edited retry must replace the old Room payload');
 await page.getByRole('button',{name:'全部任务',exact:true}).click();
 await page.getByRole('button',{name:/ChatGPT bridge/}).click();
 await page.getByRole('button',{name:'对话',exact:true}).click();
 await page.getByText('请形成规格与方案',{exact:true}).waitFor();
 assert.equal(await page.getByText('第二个任务的消息',{exact:true}).count(),0);
 const exited=new Promise(resolve=>processHandle.once('exit',(code)=>resolve(code)));
 await page.evaluate(()=>{void window.roomDesktop.quit();});
 assert.equal(await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(new Error('App quit timed out')),10000))]),0);
 writeFileSync(join(root,'report.json'),JSON.stringify({bridge_passed:true,native_composer:true,independent_windows:true,independent_minimize:true,semantic_composer:true,contenteditable_composer:true,structured_import:true,task_isolation:true,stop_generation:true,normal_exit:true,no_execution:true,authenticated_chat_tested:false},null,2));
 console.log('PASS: Room composer, webpage send, streamed reply, structured import, login recovery and reload. Evidence:',root);
}catch(error){console.error('Bridge failed:',error,root);if(instance){console.error(await(await instance.firstWindow()).locator('body').innerText().catch(()=>''));console.error(await instance.evaluate(async({webContents})=>Promise.all(webContents.getAllWebContents().filter(w=>w.getURL().startsWith('https://chatgpt.com')).map(w=>w.executeJavaScript('Array.from(document.querySelectorAll("[contenteditable]")).map(e=>({start:e.innerText.slice(0,180),end:e.innerText.slice(-100),html:e.innerHTML.slice(0,300)}))')))).catch(()=>[]));}throw error;}
finally{if(instance&&processHandle?.exitCode===null){await instance.evaluate(({app})=>app.exit()).catch(()=>{});await instance.close();}}
