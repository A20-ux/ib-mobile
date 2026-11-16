/* IB 桌面 APP · Waifu 模式 v1.1.0 —— 拟真聊天分句拆泡 + 合并发送。
   面板：启用开关 / 绑定角色卡 / 合并发送开关 + 间隔 / 打字速度(ms/字符) / 移除句末标点 / 附加提示词 / 分句预览。
   运行时（底座全局可达，全部 try/catch 兜底，卸载即还原）：
     · 拆泡：监听底座 message 事件，纯文本 AI 回复按标点拆成多条气泡，按打字速度逐条延迟出现；
     · 合并发送：包装全局 sendMsg，纯文本多条短消息攒到间隔后合并成一条交给 AI；附件 / 群聊直接放行。
   数据只存本 App 的 apiSettings。开关默认关，关掉即不碰底座。 */
(function(){
  if(!window.IBApps)return;
  var host=null,ctx=null;
  var S={enabled:false,bindCfgId:'',mergeOn:false,mergeGap:5000,typeMs:250,stripPunct:false,prompt:''};
  var cfgList=[];
  var H={installed:false,origSend:null,msgHandler:null,timers:[],mergeBuf:[],mergeTimer:null};

  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function q(sel){return host?host.querySelector(sel):null}
  function toast(t){try{ctx.ui.toast(t)}catch(e){}}
  function g(name){try{return (typeof globalThis[name]!=='undefined')?globalThis[name]:undefined}catch(e){return undefined}}

  /* ── 配置读写 ── */
  async function load(){
    try{var v=await ctx.storage.get('cfg');if(v&&typeof v==='object')S=Object.assign(S,v)}catch(e){}
    S.mergeGap=Math.min(15000,Math.max(1000,Number(S.mergeGap)||5000));
    S.typeMs=Math.min(800,Math.max(50,Number(S.typeMs)||250));
  }
  async function save(){try{await ctx.storage.set('cfg',S)}catch(e){}}

  /* ── 分句纯函数 ── */
  function splitSentences(text,strip){
    var raw=String(text||'').replace(/\r/g,'');
    if(!raw.trim())return [];
    var parts=raw.split(/\n+/),out=[];
    parts.forEach(function(p){
      var segs=p.match(/[^。！？!?；;，,、…]+[。！？!?；;，,、…]*|[。！？!?；;，,、…]+/g)||[];
      segs.forEach(function(s){
        s=s.trim();if(!s)return;
        if(strip)s=s.replace(/[。！？!?，,、；;…\s]+$/,'');
        if(s)out.push(s);
      });
    });
    var merged=[];
    out.forEach(function(s){
      var prev=merged[merged.length-1];
      if(prev&&s.length<=1&&!/[。！？!?]$/.test(prev)){merged[merged.length-1]=prev+s}else{merged.push(s)}
    });
    return merged;
  }

  /* ── 提示词注入（官方 sys 通道）── */
  function applySys(){
    try{
      if(S.enabled&&String(S.prompt||'').trim()){ctx.sys.set(String(S.prompt).trim().slice(0,4000),{cfgId:S.bindCfgId||''})}
      else{ctx.sys.clear()}
    }catch(e){}
  }

  /* ── 绑定角色卡 ── */
  async function loadCfgs(){try{cfgList=await ctx.chat.list()}catch(e){cfgList=[]}}
  function bindName(){var c=cfgList.find(function(x){return x.id===S.bindCfgId});return c?c.name:''}

  /* ═══════════════ 运行时钩子 ═══════════════ */
  /* 当前会话是否命中绑定（空绑定＝全部 1对1；群聊跳过） */
  function matchCfg(){
    try{
      var c=g('_activeCfg');if(!c)return false;
      if(c._group)return false;
      if(!S.bindCfgId)return true;
      return c.id===S.bindCfgId;
    }catch(e){return false}
  }
  /* 这条 AI 消息是否允许拆泡（卡片 / 工具 / 语音 / 表情 / 引用 / 地图 / 标记 / 话题带回 一律不拆） */
  function splittable(am){
    if(!am||am.role!=='assistant')return false;
    if(am.mark||am.topicBack||am.voice||am.images||am.files||am.sticker||am.link||am.mapRun||am.wsResults||am.wsSearches)return false;
    if(am.truncated)return false;
    return typeof am.content==='string'&&am.content.trim().length>0;
  }

  /* ── 拆泡：message 事件 ── */
  function splitHook(am){
    if(!S.enabled||!matchCfg())return;
    if(!splittable(am))return;
    var list=splitSentences(am.content,S.stripPunct);
    if(list.length<=1)return;
    /* 首句写回原消息并重渲染 */
    am.content=list[0];
    try{var redraw=g('redrawMsg');if(redraw)redraw(am)}catch(e){}
    var box=null;try{box=g('convEl')?convEl('cv-msgs'):null}catch(e){}
    var prev=am,baseTs=Number(am.timestamp||Date.now());
    for(var i=1;i<list.length;i++){
      (function(sent,idx){
        var delay=Math.max(120,Math.round(S.typeMs*Math.max(1,sent.length)));
        var t=setTimeout(function(){
          try{
            var cp=Object.assign({},am);
            cp.id='msg_'+Date.now()+'_'+Math.floor(Math.random()*100000);
            cp.content=sent;cp.timestamp=baseTs+idx;
            ['thinking','usage','blogReads','wsSearches','memHit','ctxSnap','truncated','voice','images','files','sticker','link','mapRun'].forEach(function(k){delete cp[k]});
            var dbPut=g('dbPut'),_msgs=g('_msgs'),buildMsgEl=g('buildMsgEl'),pinBottom=g('pinBottom');
            if(dbPut)dbPut('chatMessages',cp);
            if(_msgs)_msgs.push(cp);
            if(box&&buildMsgEl)box.appendChild(buildMsgEl(cp,prev));
            prev=cp;if(pinBottom)pinBottom();
          }catch(e){}
        },delay);
        H.timers.push(t);
      })(list[i],i);
    }
  }

  /* ── 合并发送：包装 sendMsg ── */
  function hasAttach(){
    try{
      var im=g('_pendImgs'),fl=g('_pendFiles'),lk=g('_pendLink'),stk=window._ibPendStk,q=g('_quote');
      return (im&&im.length)||(fl&&fl.length)||lk||stk||!!q;
    }catch(e){return false}
  }
  function flushMerge(){
    H.mergeTimer=null;
    if(!H.mergeBuf.length)return;
    var taEl=g('ta'),orig=H.origSend;
    if(!taEl||!orig)return;
    taEl.value=H.mergeBuf.join('\n');H.mergeBuf=[];
    try{var ag=g('autoGrow');if(ag)ag()}catch(e){}
    try{orig.apply(null,[])}catch(e){}
  }
  function mergedSend(){
    var c=g('_activeCfg');
    if(S.enabled&&S.mergeOn&&matchCfg()&&c&&!c._group&&!hasAttach()){
      var taEl=g('ta');if(!taEl)return;
      var txt=String(taEl.value||'').trim();
      if(txt){
        H.mergeBuf.push(txt);taEl.value='';
        try{var ag=g('autoGrow');if(ag)ag()}catch(e){}
        if(H.mergeTimer)clearTimeout(H.mergeTimer);
        H.mergeTimer=setTimeout(flushMerge,S.mergeGap);H.timers.push(H.mergeTimer);
        return;
      }
    }
    return H.origSend.apply(this,arguments);
  }

  function installHooks(){
    if(H.installed)return;
    try{
      if(typeof sendMsg==='function'){H.origSend=sendMsg;sendMsg=mergedSend}
    }catch(e){}
    try{H.msgHandler=function(am){try{splitHook(am)}catch(e){}};ctx.on('message',H.msgHandler)}catch(e){}
    H.installed=true;
  }
  function uninstallHooks(){
    try{H.timers.forEach(function(t){clearTimeout(t)});H.timers=[];H.mergeBuf=[];if(H.mergeTimer){clearTimeout(H.mergeTimer);H.mergeTimer=null}}catch(e){}
    try{if(H.origSend&&typeof sendMsg==='function'){sendMsg=H.origSend}}catch(e){}
    try{if(H.msgHandler)ctx.off('message',H.msgHandler)}catch(e){}
    H.installed=false;
  }

  /* ── 样式 ── */
  function css(){
    var old=document.getElementById('wm-css');if(old)old.remove();
    var st=document.createElement('style');st.id='wm-css';
    st.textContent=[
      '.wm-wrap{padding:14px;display:flex;flex-direction:column;gap:12px;height:100%;overflow:auto;box-sizing:border-box}',
      '.wm-hero{display:flex;gap:12px;align-items:flex-start;padding:16px;border-radius:18px;background:var(--o2card);border:1px solid var(--o2line)}',
      '.wm-hero .wm-ava{flex:none;width:42px;height:42px;border-radius:14px;background:var(--o2in);display:flex;align-items:center;justify-content:center}',
      '.wm-hero h2{margin:0;font-size:1.05rem;color:var(--o2tx)}',
      '.wm-hero p{margin:4px 0 0;font-size:0.8rem;line-height:1.55;color:var(--o2tx2)}',
      '.wm-card{padding:14px;border-radius:16px;background:var(--o2card);border:1px solid var(--o2line)}',
      '.wm-card .wm-t{font-size:0.92rem;font-weight:700;color:var(--o2tx)}',
      '.wm-card .wm-d{margin-top:3px;font-size:0.76rem;line-height:1.5;color:var(--o2tx2)}',
      '.wm-row{display:flex;align-items:center;justify-content:space-between;gap:12px}',
      '.wm-row .wm-mid{flex:1;min-width:0}',
      '.wm-sw{flex:none;width:50px;height:30px;border-radius:16px;background:var(--o2in);border:1px solid var(--o2line);position:relative;cursor:pointer;transition:background .15s}',
      '.wm-sw::after{content:"";position:absolute;top:2px;left:2px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .15s}',
      '.wm-sw.on{background:var(--o2acc);border-color:var(--o2acc)}',
      '.wm-sw.on::after{left:22px}',
      '.wm-slider{margin-top:10px}',
      '.wm-slider .wm-val{font-size:0.78rem;color:var(--o2tx2);text-align:center;margin-bottom:6px}',
      '.wm-slider input[type=range]{width:100%;accent-color:var(--o2acc)}',
      '.wm-scale{display:flex;justify-content:space-between;font-size:0.7rem;color:var(--o2tx2);margin-top:2px}',
      '.wm-bind{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px 12px;border-radius:14px;border:1px solid var(--o2line);background:var(--o2in);color:var(--o2tx);font-size:0.88rem;cursor:pointer}',
      '.wm-bind.on{border-color:var(--o2acc);color:var(--o2acc)}',
      '.wm-bind svg{width:18px;height:18px}',
      '.wm-field{margin-top:10px}',
      '.wm-field label{display:block;font-size:0.72rem;color:var(--o2tx2);margin-bottom:5px}',
      '.wm-field textarea{width:100%;box-sizing:border-box;padding:10px 11px;border-radius:12px;border:1px solid var(--o2line);background:var(--o2in);color:var(--o2tx);font-size:0.86rem;font-family:inherit;resize:vertical;min-height:96px;line-height:1.6}',
      '.wm-note{margin-top:6px;font-size:0.72rem;line-height:1.5;color:var(--o2tx2)}',
      '.wm-prev{display:flex;flex-direction:column;gap:8px;margin-top:10px}',
      '.wm-prev-bub{max-width:84%;padding:9px 12px;border-radius:4px 14px 14px 14px;background:var(--o2in);border:1px solid var(--o2line);font-size:0.84rem;line-height:1.55;color:var(--o2tx)}',
      '.wm-prev-bub.ai{align-self:flex-start}',
      '.wm-empty{padding:18px 10px;text-align:center;font-size:0.78rem;color:var(--o2tx2)}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ── 渲染 ── */
  function render(){
    var bound=bindName();
    host.innerHTML=
      '<div class="wm-wrap">'
      +'<div class="wm-hero"><div class="wm-ava"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--o2acc)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.38 8.38 0 0 1 8 8z"/></svg></div>'
      +'<div><h2>Waifu模式</h2><p>启用后，AI 的回复将按标点分割逐句发送，营造更自然的对话体验。</p></div></div>'

      +'<button type="button" class="wm-bind'+(bound?' on':'')+'" id="wm-bind">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>'
      +(bound?'已绑定：'+esc(bound):'绑定到角色卡')+'</button>'

      +'<div class="wm-card"><div class="wm-row"><div class="wm-mid"><div class="wm-t">启用Waifu模式</div><div class="wm-d">AI 回复将按标点分割发送</div></div><div class="wm-sw" id="wm-enabled" data-k="enabled"></div></div></div>'

      +'<div class="wm-card">'
      +'<div class="wm-row"><div class="wm-mid"><div class="wm-t">合并发送</div><div class="wm-d">连续发送多条短消息时，停顿后合成一条消息交给 AI 处理</div></div><div class="wm-sw" id="wm-merge" data-k="mergeOn"></div></div>'
      +'<div class="wm-field"><label>合并发送间隔</label><div class="wm-slider"><div class="wm-val" id="wm-gap-val">当前：'+S.mergeGap+'ms</div><input type="range" id="wm-gap" min="1000" max="15000" step="500" value="'+S.mergeGap+'"><div class="wm-scale"><span>1s</span><span>15s</span></div></div></div>'
      +'</div>'

      +'<div class="wm-card"><div class="wm-t">打字速度设置</div><div class="wm-d">控制每字符的延迟时间，模拟真人打字节奏</div>'
      +'<div class="wm-slider"><div class="wm-val" id="wm-type-val">当前速度：每秒 '+(1000/S.typeMs).toFixed(1)+' 字符 · 当前：'+S.typeMs+'ms/字符</div>'
      +'<input type="range" id="wm-type" min="50" max="800" step="10" value="'+S.typeMs+'"><div class="wm-scale"><span>快</span><span>慢</span></div></div></div>'

      +'<div class="wm-card"><div class="wm-row"><div class="wm-mid"><div class="wm-t">移除句末标点符号</div><div class="wm-d">移除句子末尾的句号、问号、感叹号</div></div><div class="wm-sw" id="wm-strip" data-k="stripPunct"></div></div></div>'

      +'<div class="wm-card"><div class="wm-t">Waifu模式提示词</div><div class="wm-d">自定义 Waifu 模式附加提示词。</div>'
      +'<div class="wm-field"><textarea id="wm-prompt" placeholder="你必须遵守：禁止使用动作表情，只允许使用纯文本对话；每个气泡要简短，不能一个气泡把所有话说完。">'+esc(S.prompt)+'</textarea></div>'
      +'<div class="wm-note">这段内容会作为 Waifu 模式的额外规则拼接到系统提示词中。</div></div>'

      +'<div class="wm-card"><div class="wm-t">分句预览</div><div class="wm-d">粘一段 AI 回复，实时看会拆成几个气泡（受「移除句末标点」开关影响）。</div>'
      +'<div class="wm-field"><textarea id="wm-prev-src" placeholder="粘贴一段回复…"></textarea></div>'
      +'<div class="wm-prev" id="wm-prev-out"></div></div>'
      +'</div>';

    Array.prototype.forEach.call(host.querySelectorAll('.wm-sw'),function(sw){
      var k=sw.getAttribute('data-k');
      sw.classList.toggle('on',!!S[k]);
      sw.addEventListener('click',function(){S[k]=!S[k];sw.classList.toggle('on',S[k]);save();applySys();paintPrev()});
    });

    var gap=q('#wm-gap');
    gap.addEventListener('input',function(){S.mergeGap=Number(gap.value);q('#wm-gap-val').textContent='当前：'+S.mergeGap+'ms';save()});

    var typ=q('#wm-type');
    typ.addEventListener('input',function(){S.typeMs=Number(typ.value);q('#wm-type-val').textContent='当前速度：每秒 '+(1000/S.typeMs).toFixed(1)+' 字符 · 当前：'+S.typeMs+'ms/字符';save()});

    q('#wm-prompt').addEventListener('input',function(){S.prompt=this.value;save();applySys()});
    q('#wm-bind').addEventListener('click',bindPicker);
    q('#wm-prev-src').addEventListener('input',paintPrev);
    paintPrev();
  }

  async function bindPicker(){
    await loadCfgs();
    var opts=cfgList.filter(function(c){return !c.isGroup});
    if(!opts.length){toast('还没有可绑定的角色卡');return}
    var lines=opts.map(function(c,i){return (i+1)+'. '+c.name}).join('\n');
    var raw=prompt('选择要绑定的角色卡（输入序号）：\n'+lines+'\n\n留空并取消＝解除绑定。');
    if(raw===null)return;
    var n=parseInt(String(raw).trim(),10);
    if(isNaN(n)||n<1||n>opts.length){S.bindCfgId=''}else{S.bindCfgId=opts[n-1].id}
    save();applySys();render();toast(S.bindCfgId?'已绑定角色卡':'已解除绑定');
  }

  function paintPrev(){
    var box=q('#wm-prev-out');if(!box)return;
    var src=q('#wm-prev-src').value,list=splitSentences(src,S.stripPunct);
    if(!src.trim()){box.innerHTML='<div class="wm-empty">还没有内容可预览</div>';return}
    if(!list.length){box.innerHTML='<div class="wm-empty">没有可拆分的句子</div>';return}
    box.innerHTML='<div class="wm-note">共 '+list.length+' 个气泡</div>'+list.map(function(s){return '<div class="wm-prev-bub ai">'+esc(s)+'</div>'}).join('');
  }

  IBApps.register({
    id:'waifumode',name:'Waifu模式',version:'1.1.0',sdk:2,wall:true,
    icon:'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.38 8.38 0 0 1 8 8z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>',
    mount:async function(h,c){
      host=h;ctx=c;css();host.style.padding='0';host.style.overflow='hidden';
      await load();await loadCfgs();if(!host)return;render();applySys();installHooks();
    },
    back:function(){return false},
    unmount:function(){
      uninstallHooks();
      try{ctx&&ctx.sys.clear()}catch(e){}
      host=null;ctx=null;
      var old=document.getElementById('wm-css');if(old)old.remove();
    }
  });
})();
