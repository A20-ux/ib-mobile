/* IB 桌面 APP · 正则工具 v1.1.0 —— 正则匹配 / 高亮 / 捕获组 / 替换。
   v1.1.0：改用底座 IBApps.register 契约（sdk 2），数据不入库，纯本地计算。 */
(function(){
  if(!window.IBApps)return;
  var host=null,ctx=null;

  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function q(sel){return host?host.querySelector(sel):null}
  function toast(t){try{ctx.ui.toast(t)}catch(e){}}

  function css(){
    var old=document.getElementById('rx-css');if(old)old.remove();
    var st=document.createElement('style');st.id='rx-css';
    st.textContent=[
      '.rx-wrap{padding:14px;display:flex;flex-direction:column;gap:10px;height:100%;overflow:auto;box-sizing:border-box}',
      '.rx-field label{display:block;font-size:0.72rem;color:var(--o2tx2);margin-bottom:4px}',
      '.rx-field input,.rx-field textarea{width:100%;box-sizing:border-box;padding:9px 10px;border-radius:10px;border:1px solid var(--o2line);background:var(--o2in);color:var(--o2tx);font-size:0.86rem;font-family:inherit}',
      '.rx-field textarea{resize:vertical;min-height:84px;line-height:1.5}',
      '.rx-row{display:flex;gap:8px}',
      '.rx-row .rx-field{flex:1}',
      '.rx-actions{display:flex;gap:8px;flex-wrap:wrap}',
      '.rx-btn{flex:1;min-width:96px;padding:10px 0;border-radius:11px;border:1px solid var(--o2line);background:var(--o2in);color:var(--o2tx);font-size:0.82rem;cursor:pointer}',
      '.rx-btn.pri{background:var(--o2acc);border-color:var(--o2acc);color:#fff;font-weight:700}',
      '.rx-res{background:var(--o2card);border:1px solid var(--o2line);border-radius:14px;padding:12px;white-space:pre-wrap;word-break:break-word;line-height:1.6;font-size:0.84rem;color:var(--o2tx);font-family:ui-monospace,Menlo,Consolas,monospace;min-height:60px}',
      '.rx-match{background:#ffdd77;border-radius:3px}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function run(){
    var pat=q('#rx-pat').value, flag=q('#rx-flag').value, text=q('#rx-src').value, out=q('#rx-out');
    try{
      var reg=new RegExp(pat,flag);
      var matches=[];var m;
      if(reg.global||reg.sticky){while((m=reg.exec(text))!==null){matches.push({match:m[1]||m[0],groups:m.groups||null});if(m[0]==='')reg.lastIndex++}}
      else{var one=text.match(reg);if(one)matches.push({match:one[0],groups:one.groups||null})}
      var highlighted=esc(text).replace(reg,function(x){return '<span class="rx-match">'+esc(x)+'</span>'});
      out.innerHTML='✅ 匹配 '+matches.length+' 处\n'+esc(JSON.stringify(matches,null,2))+'\n\n高亮预览：\n'+highlighted;
    }catch(e){out.textContent='❌ 正则语法错误：'+e.message}
  }

  function repl(){
    var pat=q('#rx-pat').value, flag=q('#rx-flag').value, text=q('#rx-src').value, to=q('#rx-to').value, out=q('#rx-out');
    try{var reg=new RegExp(pat,flag);out.textContent='✅ 替换结果：\n'+esc(text.replace(reg,to))}
    catch(e){out.textContent='❌ 错误：'+e.message}
  }

  function render(){
    host.innerHTML=
      '<div class="rx-wrap">'
      +'<div class="rx-field"><label>正则表达式</label><input id="rx-pat" placeholder="例：\\d+"></div>'
      +'<div class="rx-row"><div class="rx-field"><label>标志 g i m s u</label><input id="rx-flag" value="g"></div></div>'
      +'<div class="rx-field"><label>待测试文本</label><textarea id="rx-src" placeholder="粘贴需要匹配的文本"></textarea></div>'
      +'<div class="rx-actions"><button type="button" class="rx-btn pri" id="rx-run">运行匹配</button><button type="button" class="rx-btn" id="rx-repl">替换</button></div>'
      +'<div class="rx-field"><label>替换为（可用 $1 捕获组）</label><input id="rx-to" placeholder="留空＝删除匹配项"></div>'
      +'<div class="rx-res" id="rx-out"></div>'
      +'</div>';
    q('#rx-run').addEventListener('click',run);
    q('#rx-repl').addEventListener('click',repl);
  }

  IBApps.register({
    id:'regex',name:'正则工具',version:'1.1.0',sdk:2,wall:true,
    icon:'<path d="M8 6l-5 6 5 6M16 6l5 6-5 6"/><path d="M13 5l-3 14"/>',
    mount:async function(h,c){host=h;ctx=c;css();host.style.padding='0';render()},
    back:function(){return false},
    unmount:function(){host=null;ctx=null;var old=document.getElementById('rx-css');if(old)old.remove()}
  });
})();
