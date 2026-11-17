/* IB 桌面 APP · 搬家导入 v1.0.0 —— 图 8 那张「从别的 app 搬过来」。
   搬的是**记忆**：JSON / 纯文本 / Markdown 都认，一批最多 10 件，
   同名的并进已有那件（缺的细节补上），设定里已有的不重复进来。
   历史聊天（Operit 那类带 messages 的 JSON）按「一次对话 = 一张记忆卡」搬。
   角色卡 PNG 与 Word(.docx) 暂不做：前者要解 PNG 元数据建人，后者要先解压，
   都以「先导出成文本或 JSON 再搬」为准，界面上写明白。 */
(function(){
  if(!window.IBApps)return;
  var host=null,ctx=null;
  var MAX=10;
  var st={busy:false,log:[],target:''};

  function q(s){return host?host.querySelector(s):null}
  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function toast(t){try{ctx.ui.toast(t)}catch(e){}}
  function activeCfg(){try{return (typeof _activeCfg!=='undefined'&&_activeCfg)?_activeCfg:null}catch(e){return null}}
  function cfgName(c){try{return typeof cfgName==='function'?cfgName(c):(c&&(c.name||c.title))||'TA'}catch(e){return 'TA'}}

  /* ── 拆条 ── */
  function splitLine(s){
    /* 「名字: 内容」拆两半；中文冒号与英文冒号都认 */
    var m=/^([^\n:：]{1,20})[:：]\s*([\s\S]+)$/.exec(String(s||'').trim());
    if(m)return {title:m[1].trim(),content:m[2].trim()};
    var first=String(s||'').trim().split(/\n/)[0]||'';
    var t=first.replace(/[。！？!?].*$/,'').slice(0,20);
    return {title:t||('记忆 '+Date.now()),content:String(s||'').trim()};
  }

  function parseText(text){
    var out=[];
    var blocks=String(text||'').replace(/\r/g,'').split(/\n\s*\n+/);
    blocks.forEach(function(b){
      b=b.trim();if(!b)return;
      /* 一块里若全是单行小块，按行再拆 */
      var lines=b.split(/\n/).map(function(x){return x.trim()}).filter(Boolean);
      if(lines.length===1){out.push(splitLine(lines[0]));return}
      /* 首行像标题就整体一块；否则逐行一条 */
      var allColon=lines.every(function(l){return /^[^\n:：]{1,20}[:：]/.test(l)});
      if(allColon){lines.forEach(function(l){out.push(splitLine(l))});return}
      var hasColon=/^[^\n:：]{1,20}[:：]/.test(lines[0]);
      if(hasColon||lines.length<=3){out.push(splitLine(b));return}
      lines.forEach(function(l){out.push(splitLine(l))});
    });
    return out;
  }

  function flattenChat(arr,name){
    var lines=[];
    arr.forEach(function(m){
      if(!m||typeof m!=='object')return;
      var role=m.role||m.sender||m.from||'';
      var txt=String(m.content||m.text||m.message||'').trim();
      if(!txt)return;
      var who=(role==='user'||role==='me')?'我':((role==='assistant'||role==='ai'||role==='bot')?'TA':(role||'TA'));
      lines.push(who+'：'+txt);
    });
    return lines.join('\n');
  }

  function parseJSON(text,fname){
    var j=null;try{j=JSON.parse(text)}catch(e){return null}
    var items=[];
    var src=Array.isArray(j)?j:(j.memories||j.data||j.items||null);
    if(Array.isArray(src)&&src.length&&typeof src[0]==='object'&&!src[0].role&&!src[0].sender){
      src.forEach(function(o){
        var t=String(o.title||o.name||o.key||o.topic||'').trim();
        var c=String(o.content||o.text||o.value||o.summary||o.body||'').trim();
        if(c)items.push({title:(t||c.slice(0,16)).slice(0,40),content:c});
      });
      if(items.length)return items;
    }
    /* 历史聊天：{messages:[...]} 或多段对话 */
    var chats=null;
    if(Array.isArray(j)&&j.length&&j[0]&&(j[0].role||j[0].content))chats=[{name:fname,msgs:j}];
    else if(j&&Array.isArray(j.messages))chats=[{name:j.name||j.title||fname,msgs:j.messages}];
    else if(j&&Array.isArray(j.conversations)){chats=j.conversations.map(function(c,i){return {name:c.name||c.title||('会话 '+(i+1)),msgs:c.messages||c.msgs||[]}})}
    if(chats&&chats.length){
      chats.forEach(function(c){
        var body=flattenChat(c.msgs||[],c.name);
        if(body)items.push({title:('聊天记录 · '+String(c.name||fname)).slice(0,40),content:body.slice(0,6000)});
      });
      return items;
    }
    /* 一个对象本身就是一条 */
    if(j&&typeof j==='object'){
      var c2=String(j.content||j.text||j.summary||'').trim();
      if(c2)return [{title:String(j.title||j.name||'导入记忆').slice(0,40),content:c2}];
    }
    return items;
  }

  function parseFile(name,text){
    var ext=String((name||'').split('.').pop()||'').toLowerCase();
    if(ext==='json'){var j=parseJSON(text,name);if(j&&j.length)return j}
    if(ext==='docx'||ext==='doc')return null;/* 需要先解压，见界面说明 */
    return parseText(text);
  }

  /* ── 写入 ── */
  async function memRec(title,content,targetId,targetName){
    return {
      id:'mem_'+Date.now()+'_'+Math.floor(Math.random()*100000),
      title:String(title||'').slice(0,60),content:String(content||'').slice(0,3000),
      summary:String(content||'').slice(0,80),oneLine:'',
      domain:'日常',tags:['搬家导入'],importance:6,valence:0.5,arousal:0.3,
      pinned:false,resolved:true,visibility:'only',
      visibleTo:targetId?[targetId]:[],excludeFrom:[],
      rawSource:'import',sourceId:'mover',kind:'import',
      eventTime:0,eventTo:0,links:[],merged:[],supersededBy:'',dormant:false,
      activationCount:0,created:Date.now(),lastActivated:Date.now(),
      createdBy:targetId||'',createdByName:targetName||'',editedByUser:false
    };
  }
  async function allMems(){try{return await new Promise(function(res,rej){var r=db.transaction('memories','readonly').objectStore('memories').getAll();r.onsuccess=function(){res(r.result||[])};r.onerror=function(){rej(r.error)}})}catch(e){return []}}

  async function doImport(list){
    if(!list||!list.length){toast('这个文件里没读出东西');return}
    var cfg=activeCfg();
    var targetId=st.target||(cfg?cfg.id:'');
    var targetName=targetId&&cfg?cfgName(cfg):'';
    var existing=await allMems();
    var byTitle={};existing.forEach(function(m){if(m&&m.title)byTitle[String(m.title)]=m});
    var added=0,merged=0,dup=0,over=0;
    var rows=[];
    for(var i=0;i<list.length;i++){
      var it=list[i];
      if(!it||!it.content)continue;
      if(added+merged>=MAX){over++;continue}
      var hit=byTitle[it.title];
      if(hit){
        var oldBody=String(hit.content||'');
        var lines=String(it.content).split(/\n/).filter(function(l){return l&&oldBody.indexOf(l)<0});
        if(!lines.length){dup++;continue}
        var nM=Object.assign({},hit,{content:(oldBody+'\n'+lines.join('\n')).slice(0,3000),lastActivated:Date.now()});
        try{await dbPut('memories',nM)}catch(e){continue}
        byTitle[it.title]=nM;merged++;
        rows.push({t:it.title,ok:true,kind:'并入'});
      }else{
        var rec=await memRec(it.title,it.content,targetId,targetName);
        try{await dbPut('memories',rec)}catch(e){rows.push({t:it.title,ok:false,kind:'失败'});continue}
        byTitle[it.title]=rec;added++;
        rows.push({t:it.title,ok:true,kind:'新记忆'});
      }
    }
    try{window.IBVec&&IBVec.touch()}catch(e){}
    try{window.IBMem&&IBMem.dirty()}catch(e){}
    try{if(typeof renderMemLib==='function')renderMemLib()}catch(e){}
    var msg='搬完：新增 '+added+' 件，并入 '+merged+' 件'+(dup?('，重复跳过 '+dup):'')+(over?('，超出 10 件没搬 '+over):'');
    toast(msg);
    st.log=rows;render();
  }

  /* ── 界面 ── */
  function css(){
    var old=document.getElementById('mv-css');if(old)old.remove();
    var s=document.createElement('style');s.id='mv-css';
    s.textContent=[
      '#mv-card{margin:0 0 12px;border-radius:20px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);padding:16px;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}',
      '#mv-t{font-size:1.02rem;font-weight:700;color:#eef3fb}',
      '#mv-d{margin-top:9px;font-size:0.84rem;line-height:1.8;color:rgba(228,238,252,.66);white-space:pre-wrap}',
      '#mv-btn{margin-top:14px;padding:11px 22px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.1);color:#eef3fb;font-size:0.9rem;cursor:pointer}',
      '#mv-btn[disabled]{opacity:.5}',
      '#mv-pick{margin-top:14px;display:flex;align-items:center;gap:10px}',
      '#mv-pick select{flex:1;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#eef3fb;font-family:inherit;font-size:0.84rem}',
      '#mv-log{margin-top:12px;display:flex;flex-direction:column;gap:6px}',
      '.mv-row{display:flex;gap:8px;align-items:center;font-size:0.8rem;color:rgba(230,240,252,.78);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:8px 10px}',
      '.mv-round{flex:none;font-size:0.68rem;padding:1px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.18);color:rgba(230,240,252,.7)}',
      '.mv-round.new{color:#8fd0a8;border-color:rgba(90,190,130,.45)}',
      '.mv-round.mrg{color:#8fb6e8;border-color:rgba(90,150,220,.45)}',
      '#mv-tip{margin-top:12px;font-size:0.76rem;line-height:1.7;color:rgba(228,238,252,.5)}',
      '#mv-file{display:none}'
    ].join('\n');
    document.head.appendChild(s);
  }

  async function render(){
    var cfg=activeCfg();
    var list=[];try{list=await ctx.chat.list()}catch(e){}
    if(!st.target)st.target=cfg?cfg.id:(list[0]?list[0].id:'');
    host.innerHTML='<div id="mv-card">'
      +'<div id="mv-t">从别的 app 搬过来</div>'
      +'<div id="mv-d">选一个文件，认三样：记忆库 JSON（数组或 {memories:[…]}）、纯文本 / Markdown（一段一件，或一行一件，「名字: 内容」会拆成标题和正文）、历史聊天 JSON（带 messages 的那种，一次对话整成一张「聊天记录」记忆卡）。\n\n规矩按原图：同类同名并进已有那件、缺的细节补上；已有条目不重复进来；一次最多搬 10 件，多的留到下一次。\n\nWord(.docx) 与角色卡 PNG 还没做——先把它们导出成文本或 JSON 再搬。</div>'
      +'<div id="mv-pick"><select id="mv-who">'
        +(list.length?list.map(function(c){return '<option value="'+esc(c.id)+'"'+(st.target===c.id?' selected':'')+'>'+esc(c.name||'对话')+'</option>'}).join(''):'<option value="">（还没有对话，先不绑定 TA）</option>')
      +'</select></div>'
      +'<button type="button" id="mv-btn"'+(st.busy?' disabled':'')+'>'+(st.busy?'搬着…':'选个文件')+'</button>'
      +'<input type="file" id="mv-file" accept=".json,.txt,.md,.markdown,.csv,.jsonl,text/plain,application/json">'
      +(st.log.length?('<div id="mv-log">'+st.log.map(function(r){
          return '<div class="mv-row"><span class="mv-round '+(r.kind==='新记忆'?'new':(r.kind==='并入'?'mrg':''))+'">'+esc(r.kind)+'</span>'+esc(r.t)+'</div>';
        }).join('')+'</div>'):'')
      +'<div id="mv-tip">绑定到哪个 TA 决定这张记忆谁能想起来；不绑就是公共的。</div>'
    +'</div>';

    var sel=q('#mv-who');
    if(sel)sel.addEventListener('change',function(){st.target=this.value;toast('已切到 '+(this.options[this.selectedIndex].textContent||''))});
    q('#mv-btn').addEventListener('click',function(){q('#mv-file').click()});
    q('#mv-file').addEventListener('change',async function(){
      var f=this.files&&this.files[0];this.value='';
      if(!f)return;
      if(/\.(docx|doc)$/i.test(f.name)){toast('Word 得先导出成文本或 JSON 再搬');return}
      st.busy=true;render();
      try{
        var text=await new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(String(r.result||''))};r.onerror=function(){rej(r.error)};r.readAsText(f)});
        var items=parseFile(f.name,text);
        if(!items){toast('这个文件里没读出东西');st.busy=false;render();return}
        await doImport(items);
      }catch(e){toast('读失败：'+((e&&e.message)||e))}
      st.busy=false;render();
    });
  }

  IBApps.register({
    id:'mover',name:'搬家导入',version:'1.0.0',sdk:2,
    icon:'<path d="M4 8.5h16M4 8.5v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9"/><path d="M9.5 8.5V6.2A1.7 1.7 0 0 1 11.2 4.5h1.6A1.7 1.7 0 0 1 14.5 6.2v2.3"/><path d="M12 12v5M9.5 14.5L12 12l2.5 2.5"/>',
    mount:async function(h,c){host=h;ctx=c;css();await render()},
    back:function(){return false},
    unmount:function(){host=null;ctx=null;var o=document.getElementById('mv-css');if(o)o.remove()}
  });
})();
