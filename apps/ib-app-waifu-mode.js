/* IB 桌面 APP · Waifu 模式 v1.5.0 —— 拟真聊天分句拆泡 + 合并发送（全局常驻）。
   分泡规则（v1.4.0 重写，对齐真人聊天的节奏）：
     · 一行（换行）＝一个气泡；行内不再按空格碎切；
     · 单行超过「最长」就在句号 / 问号 / 感叹号 / 分号处贪心切块，每块不超过最长；
     · 剩下的碎句（短于「最短」）并进前一个气泡，避免「嗯」「好」这类孤零零的小泡。
   运行时（脚本加载即挂全局钩子，不随面板开关拆卸，全部 try/catch 兜底）：
     · 拆泡：包装 IBApps._emit 拦截 message 事件（面板关闭也能收到），按上面的规则把一条纯文本 AI 回复
       拆成多条气泡，按打字速度逐条延迟出现；首句写回原消息并重渲染落库；后续句子逐条入 _msgs / DB / DOM。
     · 合并发送：包装全局 sendMsg，纯文本多条短消息攒到间隔后合并成一条交给 AI；附件 / 群聊直接放行。
     · 附加提示词：直接写 window._ibAppSysM，面板关闭后由 unmount 延迟重挂，不随 SDK 清理丢失。
   ⚠ 关键：底座的 db / ta / _activeCfg / _msgs 都是顶层 let / const，挂在「全局词法环境」而不是 window 上，
     用 globalThis['_activeCfg'] 永远取到 undefined —— 必须直接用标识符引用（本文件全部走 _ref 系列函数）。
   数据只存本 App 的 apiSettings。开关默认关，关掉即不碰底座。 */
(function(){
  if(!window.IBApps)return;
  var host=null,ctx=null;
  var S={enabled:true,bindCfgId:'',mergeOn:false,mergeGap:5000,typeMs:250,stripPunct:false,minLen:2,maxLen:60,prompt:''};
  var cfgList=[];
  var H={installed:false,origSend:null,origEmit:null,origSave:null,timers:[],mergeBuf:[],mergeTimer:null,lastSplit:0};

  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function q(sel){return host?host.querySelector(sel):null}
  function toast(t){try{ctx.ui.toast(t)}catch(e){}}

  /* ═══════════════ 底座标识符访问（let/const 不进 window，必须裸引用） ═══════════════ */
  function _refCfg(){try{return _activeCfg||null}catch(e){return null}}
  function _refMsgs(){try{return _msgs||null}catch(e){return null}}
  function _refThread(){try{return _activeThread||null}catch(e){return null}}
  function _refTa(){try{return ta||null}catch(e){return null}}
  function _refPend(){
    var o={imgs:null,files:null,link:null,stk:null,quote:null};
    try{o.imgs=_pendImgs}catch(e){}
    try{o.files=_pendFiles}catch(e){}
    try{o.link=_pendLink}catch(e){}
    try{o.stk=window._ibPendStk}catch(e){}
    try{o.quote=_quote}catch(e){}
    return o;
  }
  function _fnConvEl(){try{return typeof convEl==='function'?convEl:null}catch(e){return null}}
  function _fnRedraw(){try{return typeof redrawMsg==='function'?redrawMsg:null}catch(e){return null}}
  function _fnDbPut(){try{return typeof dbPut==='function'?dbPut:null}catch(e){return null}}
  function _fnBuild(){try{return typeof buildMsgEl==='function'?buildMsgEl:null}catch(e){return null}}
  function _fnPin(){try{return typeof pinBottom==='function'?pinBottom:null}catch(e){return null}}
  function _fnGrow(){try{return typeof autoGrow==='function'?autoGrow:null}catch(e){return null}}
  function _fnCfgName(){try{return typeof cfgName==='function'?cfgName:null}catch(e){return null}}

  /* ── 配置读写（不依赖 ctx，脚本加载时 ctx 还没注入）── */
  function _key(){return 'app_waifumode_cfg'}
  async function storageGet(){
    try{
      var r=await new Promise(function(res,rej){
        var tx=db.transaction('apiSettings','readonly');
        var req=tx.objectStore('apiSettings').get(_key());
        req.onsuccess=function(){res(req.result)};
        req.onerror=function(){rej(req.error)};
      });
      return r?r.v:undefined;
    }catch(e){return undefined}
  }
  async function storageSet(v){
    try{await dbPut('apiSettings',{id:_key(),app:'waifumode',key:'cfg',v:v,updated:Date.now()})}catch(e){}
  }
  async function load(){
    try{var v=await storageGet();if(v&&typeof v==='object'){S=Object.assign(S,v);if(v.mig!==15){S.enabled=true;S.mig=15;try{await storageSet(S)}catch(e){}}}}catch(e){}
    S.mergeGap=Math.min(15000,Math.max(1000,Number(S.mergeGap)||5000));
    S.typeMs=Math.min(800,Math.max(50,Number(S.typeMs)||250));
    S.minLen=Math.min(60,Math.max(0,Number(S.minLen)||0));
    S.maxLen=Math.min(200,Math.max(15,Number(S.maxLen)||60));
    if(S.maxLen<S.minLen)S.maxLen=S.minLen;
  }
  async function save(){
    try{await storageSet(S)}catch(e){
      try{ctx&&ctx.storage.set('cfg',S)}catch(e2){}
    }
  }

  /* ═══════════════ 分泡纯函数 ═══════════════
     1) 按换行切行，一行一个气泡（行内不按空格碎切）
     2) 单行超过 maxLen：按句末标点贪心切块，每块不超过 maxLen
     3) 短于 minLen 的碎句并进前一个气泡（并进去也不超过 maxLen 才并）
     4) strip：去掉每个气泡末尾的标点 */
  function splitBubbles(text,opts){
    opts=opts||{};
    var strip=!!opts.strip,minLen=Number(opts.minLen)||0,maxLen=Number(opts.maxLen)||60;
    var raw=String(text||'').replace(/\r/g,'');
    if(!raw.trim())return [];

    var lines=raw.split(/\n+/).map(function(x){return x.trim()}).filter(function(x){return x.length>0});
    var segs=[];
    lines.forEach(function(line){
      /* 一句一泡：先把一行按句末标点切句；只有「没有句末标点」的残句才可能并回去 */
      var parts=line.match(/[^。！？!?；;]+[。！？!?；;]*|[。！？!?；;]+/g)||[line];
      parts.forEach(function(p){
        p=String(p||'').trim();if(!p)return;
        segs.push({t:p,end:/[。！？!?；;]$/.test(p)});
      });
    });

    /* 残句（没有句末标点且太短）并进前一个；整句一律独占一个气泡 */
    var out=[];
    segs.forEach(function(o){
      var s=o.t;if(!s)return;
      var prev=out.length?out[out.length-1]:null;
      var tiny=!o.end&&s.replace(/[\s，,、…~～]/g,'').length<=minLen;
      if(prev!=null&&tiny&&(prev+s).length<=maxLen){out[out.length-1]=prev+s;return}
      if(!s.replace(/[\s，,、…~～。！？!?；;]/g,'').length)return;/* 整泡只有标点：丢掉，不生成空气泡 */
      out.push(s);
    });

    if(strip)out=out.map(function(s){return s.replace(/[。！？!?，,、；;…~～\s]+$/,'').trim()}).filter(Boolean);
    return out;
  }
  /* 兼容旧名 */
  function splitSentences(text,strip){return splitBubbles(text,{strip:strip,minLen:S.minLen,maxLen:S.maxLen})}

  /* ── 提示词注入（直接写 window._ibAppSysM，不依赖 ctx，面板开关都不丢）── */
  function applySys(){
    try{
      if(S.enabled&&String(S.prompt||'').trim()){
        window._ibAppSysM={app:'waifumode',cfgId:S.bindCfgId||'',text:String(S.prompt).trim().slice(0,4000),data:null};
      }else{
        if(window._ibAppSysM&&window._ibAppSysM.app==='waifumode')window._ibAppSysM=null;
      }
    }catch(e){}
  }

  /* ── 绑定角色卡 ── */
  async function loadCfgs(){
    try{
      cfgList=(_cfgs||[]).map(function(c){return {id:c.id,name:(_fnCfgName()||function(x){return x.name||x.id})(c),isGroup:false}});
      try{(await dbGetAll('groups')).forEach(function(gr){cfgList.push({id:gr.id,name:gr.name||'群聊',isGroup:true})})}catch(e){}
    }catch(e){cfgList=[]}
  }
  function bindName(){var c=cfgList.find(function(x){return x.id===S.bindCfgId});return c?c.name:''}

  /* ═══════════════ 运行时 ═══════════════ */
  function matchCfg(){
    var c=_refCfg();
    if(!c)return false;
    if(c._group)return false;
    if(!S.bindCfgId)return true;
    return c.id===S.bindCfgId;
  }
  function splittable(am){
    if(!am||am.role!=='assistant')return false;
    if(am._wmSplit)return false;
    if(am.mark||am.topicBack||am.voice||am.images||am.files||am.sticker||am.link||am.mapRun||am.wsResults||am.wsSearches)return false;
    if(am.truncated)return false;
    return typeof am.content==='string'&&am.content.trim().length>0;
  }

  /* ── 拆泡 ── */
  function splitHook(am){
    if(!S.enabled)return;
    /* 只有「当前正开着的这段会话」才拆：别的角色 / 别的线程后台完成的回复不去动它，
       否则首句落库、其余几句按 stillHere 判定被丢掉，等于吞词 */
    try{
      var ac0=_refCfg(),at0=_refThread();
      if(ac0&&am&&am.friendId&&String(ac0.id)!==String(am.friendId))return;
      if(at0&&am&&am.threadId&&String(at0.id)!==String(am.threadId))return;
    }catch(e){}
    if(!matchCfg())return;
    if(!splittable(am))return;
    var list=splitBubbles(am.content,{strip:S.stripPunct,minLen:S.minLen,maxLen:S.maxLen});
    if(list.length<=1)return;
    if(!list[0])return;

    am._wmSplit=true;
    am.content=list[0];
    /* 首句落库 + 重渲染 */
    try{var put=_fnDbPut();if(put)put('chatMessages',am)}catch(e){}
    try{var rd=_fnRedraw();if(rd)rd(am)}catch(e){}

    var cfgId=(_refCfg()||{}).id, thId=(_refThread()||{}).id;
    var box=null;try{var ce=_fnConvEl();if(ce)box=ce('cv-msgs')}catch(e){}
    var prev=am,baseTs=Number(am.timestamp||Date.now());
    H.lastSplit=Date.now();

    for(var i=1;i<list.length;i++){
      (function(sent,idx){
        var delay=Math.min(1500,Math.max(160,Math.round(S.typeMs*Math.max(1,sent.length))));
        var t=setTimeout(function(){
          try{
            var ac=_refCfg(),at=_refThread();
            var stillHere=!!(ac&&ac.id===cfgId&&(at||{}).id===thId);
            var cp=Object.assign({},am);
            cp.id='msg_'+Date.now()+'_'+Math.floor(Math.random()*100000);
            cp.content=sent;cp.timestamp=baseTs+idx;cp._wmSplit=true;
            ['thinking','usage','blogReads','wsSearches','memHit','ctxSnap','truncated','voice','images','files','sticker','link','mapRun','wsResults'].forEach(function(k){delete cp[k]});
            var put2=_fnDbPut(),msgs=_refMsgs(),build=_fnBuild(),pin=_fnPin();
            if(put2)put2('chatMessages',cp);
            if(stillHere&&msgs)msgs.push(cp);
            if(stillHere&&box&&build)box.appendChild(build(cp,prev));
            if(stillHere)prev=cp;
            if(stillHere&&pin)pin();
          }catch(e){}
        },delay);
        H.timers.push(t);
      })(list[i],i);
    }
  }

  /* ── 合并发送 ── */
  function hasAttach(){
    try{
      var p=_refPend();
      return (p.imgs&&p.imgs.length)||(p.files&&p.files.length)||p.link||p.stk||!!p.quote;
    }catch(e){return false}
  }
  function flushMerge(){
    H.mergeTimer=null;
    if(!H.mergeBuf.length)return;
    var taEl=_refTa(),orig=H.origSend;
    if(!taEl||!orig)return;
    taEl.value=H.mergeBuf.join('\n');H.mergeBuf=[];
    try{var ag=_fnGrow();if(ag)ag()}catch(e){}
    try{orig.apply(null,[])}catch(e){}
  }
  function mergedSend(){
    var c=_refCfg();
    if(S.enabled&&S.mergeOn&&matchCfg()&&c&&!c._group&&!hasAttach()){
      var taEl=_refTa();if(!taEl)return;
      var txt=String(taEl.value||'').trim();
      if(txt){
        H.mergeBuf.push(txt);taEl.value='';
        try{var ag=_fnGrow();if(ag)ag()}catch(e){}
        if(H.mergeTimer)clearTimeout(H.mergeTimer);
        H.mergeTimer=setTimeout(flushMerge,S.mergeGap);H.timers.push(H.mergeTimer);
        return;
      }
    }
    return H.origSend.apply(this,arguments);
  }

  /* ── 全局钩子（脚本加载即挂，永不随面板拆卸）── */
  function installGlobalHooks(){
    if(H.installed)return;
    try{
      if(typeof sendMsg==='function'){H.origSend=sendMsg;sendMsg=mergedSend}
    }catch(e){}
    /* v1.5.0：saveAi 是 TA 每条回复唯一必经的落库点，直接包住它——
       IBApps._emit 只在「某个桌面 APP 正开着」时才派发，平时的聊天页根本收不到，
       这也是分泡看着像没生效的原因。 */
    try{
      if(typeof saveAi==='function'&&!H.origSave){
        H.origSave=saveAi;
        saveAi=async function(){
          var am=await H.origSave.apply(this,arguments);
          try{
            var ctx9=arguments[4];
            var live=true;try{live=ctx9&&typeof ctx9.sameConv==='function'?!!ctx9.sameConv():true}catch(e){live=true}
            if(live&&am)splitHook(am);
          }catch(e){}
          return am;
        };
      }
    }catch(e){}
    try{
      if(window.IBApps&&typeof window.IBApps._emit==='function'&&!H.origEmit){
        H.origEmit=window.IBApps._emit;
        window.IBApps._emit=function(ev,payload){
          if(ev==='message'){try{splitHook(payload)}catch(e){}}
          return H.origEmit.apply(this,arguments);
        };
      }
    }catch(e){}
    /* v1.5.0：底座在每条 TA 回复落库后无条件回调一次（不依赖桌面 APP 是否打开） */
    try{
      window._ibAfterAiMsg=function(am){try{if(S.enabled)splitHook(am)}catch(e){}};
    }catch(e){}
    H.installed=true;
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
      '.wm-prev-bub{max-width:84%;padding:9px 12px;border-radius:4px 14px 14px 14px;background:var(--o2in);border:1px solid var(--o2line);font-size:0.84rem;line-height:1.55;color:var(--o2tx);white-space:pre-wrap}',
      '.wm-prev-bub.ai{align-self:flex-start}',
      '.wm-empty{padding:18px 10px;text-align:center;font-size:0.78rem;color:var(--o2tx2)}',
      '.wm-status{margin-top:2px;padding:9px 12px;border-radius:10px;background:var(--o2in);font-size:0.72rem;line-height:1.6;color:var(--o2tx2)}',
      '.wm-status b{color:var(--o2acc)}',
      '.wm-status .wm-bad{color:#d9534f}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function statusHTML(){
    var c=_refCfg(),cn=_fnCfgName();
    var lines=[];
    lines.push('钩子：'+(H.installed?'<b>已挂载</b>':'<span class="wm-bad">未挂载</span>')+(H.origEmit?' · 消息通道已接管':' · <span class="wm-bad">消息通道未接管</span>'));
    lines.push('开关：'+(S.enabled?'<b>已启用</b>':'未启用')+(S.mergeOn?' · 合并发送开':''));
    if(c){
      var nm=cn?cn(c):(c.name||c.id);
      lines.push('当前会话：'+esc(nm)+(c._group?'（群聊）':'')+' · '+(matchCfg()?'<b>命中</b>':'<span class="wm-bad">不命中（不会拆）</span>'));
    }else{
      lines.push('当前会话：未在对话中');
    }
    if(!S.bindCfgId)lines.push('绑定：未绑定 → 对所有 1对1 生效');
    return '运行状态<br>'+lines.join('<br>');
  }

  function render(){
    var bound=bindName();
    host.innerHTML=
      '<div class="wm-wrap">'
      +'<div class="wm-hero"><div class="wm-ava"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="var(--o2acc)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.38 8.38 0 0 1 8 8z"/></svg></div>'
      +'<div><h2>Waifu模式</h2><p>一段一行一个气泡；太长在句号处切，太短的并回前一句。关面板后仍在后台运行。</p></div></div>'

      +'<button type="button" class="wm-bind'+(bound?' on':'')+'" id="wm-bind">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>'
      +(bound?'已绑定：'+esc(bound):'绑定到角色卡')+'</button>'

      +'<div class="wm-card"><div class="wm-row"><div class="wm-mid"><div class="wm-t">启用Waifu模式</div><div class="wm-d">AI 回复按段落 / 句号分成多个气泡</div></div><div class="wm-sw" id="wm-enabled" data-k="enabled"></div></div></div>'

      +'<div class="wm-card"><div class="wm-t">气泡长短</div><div class="wm-d">一行＝一个气泡。短于「最短」的并回前一句，长于「最长」的在句号处切开。</div>'
      +'<div class="wm-slider"><div class="wm-val" id="wm-min-val">最短：'+S.minLen+' 字（比这更短就并回前一句）</div>'
      +'<input type="range" id="wm-min" min="0" max="40" step="2" value="'+S.minLen+'"><div class="wm-scale"><span>不合并</span><span>40字</span></div></div>'
      +'<div class="wm-slider"><div class="wm-val" id="wm-max-val">最长：'+S.maxLen+' 字（超过就在句号处切开）</div>'
      +'<input type="range" id="wm-max" min="15" max="120" step="5" value="'+S.maxLen+'"><div class="wm-scale"><span>15字</span><span>120字</span></div></div>'
      +'</div>'

      +'<div class="wm-card">'
      +'<div class="wm-row"><div class="wm-mid"><div class="wm-t">合并发送</div><div class="wm-d">连续发送多条短消息时，停顿后合成一条交给 AI</div></div><div class="wm-sw" id="wm-merge" data-k="mergeOn"></div></div>'
      +'<div class="wm-field"><label>合并发送间隔</label><div class="wm-slider"><div class="wm-val" id="wm-gap-val">当前：'+S.mergeGap+'ms</div><input type="range" id="wm-gap" min="1000" max="15000" step="500" value="'+S.mergeGap+'"><div class="wm-scale"><span>1s</span><span>15s</span></div></div></div>'
      +'</div>'

      +'<div class="wm-card"><div class="wm-t">打字速度</div><div class="wm-d">每条气泡出现的延迟＝每个字符的时间 × 这条的长度</div>'
      +'<div class="wm-slider"><div class="wm-val" id="wm-type-val">当前速度：每秒 '+(1000/S.typeMs).toFixed(1)+' 字符 · 当前：'+S.typeMs+'ms/字符</div>'
      +'<input type="range" id="wm-type" min="50" max="800" step="10" value="'+S.typeMs+'"><div class="wm-scale"><span>快</span><span>慢</span></div></div></div>'

      +'<div class="wm-card"><div class="wm-row"><div class="wm-mid"><div class="wm-t">移除句末标点符号</div><div class="wm-d">移除每个气泡末尾的句号、问号、感叹号</div></div><div class="wm-sw" id="wm-strip" data-k="stripPunct"></div></div></div>'

      +'<div class="wm-card"><div class="wm-t">Waifu模式提示词</div><div class="wm-d">自定义附加提示词，关面板后仍生效。</div>'
      +'<div class="wm-field"><textarea id="wm-prompt" placeholder="你必须遵守：禁止使用动作表情，只允许使用纯文本对话；每个气泡要简短，不能一个气泡把所有话说完。">'+esc(S.prompt)+'</textarea></div>'
      +'<div class="wm-note">这段内容会作为额外规则拼接到系统提示词中。</div></div>'

      +'<div class="wm-card"><div class="wm-t">分句预览</div><div class="wm-d">粘一段 AI 回复，实时看会拆成几个气泡（跟着上面两个滑杆走）。</div>'
      +'<div class="wm-field"><textarea id="wm-prev-src" placeholder="粘贴一段回复…"></textarea></div>'
      +'<div class="wm-prev" id="wm-prev-out"></div></div>'

      +'<div class="wm-status" id="wm-status">'+statusHTML()+'</div>'
      +'</div>';

    Array.prototype.forEach.call(host.querySelectorAll('.wm-sw'),function(sw){
      var k=sw.getAttribute('data-k');
      sw.classList.toggle('on',!!S[k]);
      sw.addEventListener('click',function(){
        S[k]=!S[k];sw.classList.toggle('on',S[k]);save();applySys();paintPrev();
        var stEl=q('#wm-status');if(stEl)stEl.innerHTML=statusHTML();
      });
    });

    var minS=q('#wm-min');
    minS.addEventListener('input',function(){S.minLen=Number(minS.value);if(S.maxLen<S.minLen){S.maxLen=S.minLen;q('#wm-max').value=S.maxLen;q('#wm-max-val').textContent='最长：'+S.maxLen+' 字（超过就在句号处切开）'}q('#wm-min-val').textContent='最短：'+S.minLen+' 字（比这更短就并回前一句）';save();paintPrev()});

    var maxS=q('#wm-max');
    maxS.addEventListener('input',function(){S.maxLen=Number(maxS.value);q('#wm-max-val').textContent='最长：'+S.maxLen+' 字（超过就在句号处切开）';save();paintPrev()});

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
    var src=q('#wm-prev-src').value;
    var list=splitBubbles(src,{strip:S.stripPunct,minLen:S.minLen,maxLen:S.maxLen});
    if(!src.trim()){box.innerHTML='<div class="wm-empty">还没有内容可预览</div>';return}
    if(!list.length){box.innerHTML='<div class="wm-empty">没有可拆分的句子</div>';return}
    box.innerHTML='<div class="wm-note">共 '+list.length+' 个气泡</div>'+list.map(function(s){return '<div class="wm-prev-bub ai">'+esc(s)+'</div>'}).join('');
  }

  /* ═══════════════ 脚本加载即启动 ═══════════════ */
  (async function boot(){
    for(var i=0;i<60;i++){
      var ok=false;
      try{ok=!!(db&&db.objectStoreNames&&db.objectStoreNames.contains('apiSettings'))}catch(e){ok=false}
      if(ok)break;
      await new Promise(function(r){setTimeout(r,100)});
    }
    await load();
    installGlobalHooks();
    applySys();
    try{var stEl=host&&host.querySelector('#wm-status');if(stEl)stEl.innerHTML=statusHTML()}catch(e){}
  })();

  IBApps.register({
    id:'waifumode',name:'Waifu模式',version:'1.5.0',sdk:2,wall:true,
    icon:'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.38 8.38 0 0 1 8 8z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>',
    mount:async function(h,c){
      host=h;ctx=c;css();host.style.padding='0';host.style.overflow='hidden';
      await load();await loadCfgs();if(!host)return;render();applySys();
    },
    back:function(){return false},
    unmount:function(){
      /* 不拆全局钩子——Waifu 模式是后台常驻功能 */
      /* SDK close() 会清掉 _ibAppSysM，延迟重挂 */
      setTimeout(function(){applySys()},80);
      host=null;ctx=null;
      var old=document.getElementById('wm-css');if(old)old.remove();
    }
  });
})();
