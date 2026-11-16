/* IB 桌面 APP · Waifu 模式 v1.0.0 —— 拟真聊天气泡分句设置面板。
   面板：启用开关 / 绑定角色卡 / 合并发送开关 + 间隔 / 打字速度(ms/字符) / 移除句末标点 / 附加提示词。
   数据只存本 App 的 apiSettings（app_waifumode_*），随底座备份导出。
   边界（sdk 2 官方接口）：
     · 附加提示词经 ctx.sys.set 挂进系统提示词（面板会话期间生效，关面板按底座机制摘除）；
     · 分句规则与去标点是纯本地函数，面板内可实时预览会拆成几个气泡；
     · 「真实聊天里把一条 AI 回复拆成多条气泡逐条发」「拦截输入框合并发送」底座未开放官方钩子，
       本期不直连消息库 / 不包装发送函数；待底座预留接入点后再接。相关接入点调研结论写在文件末尾注释。 */
(function(){
  if(!window.IBApps)return;
  var host=null,ctx=null;
  var S={enabled:false,bindCfgId:'',mergeOn:false,mergeGap:5000,typeMs:250,stripPunct:false,prompt:''};
  var cfgList=[];

  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function q(sel){return host?host.querySelector(sel):null}
  function toast(t){try{ctx.ui.toast(t)}catch(e){}}

  /* ── 配置读写 ── */
  async function load(){
    try{var v=await ctx.storage.get('cfg');if(v&&typeof v==='object')S=Object.assign(S,v)}catch(e){}
    S.mergeGap=Math.min(15000,Math.max(1000,Number(S.mergeGap)||5000));
    S.typeMs=Math.min(800,Math.max(50,Number(S.typeMs)||250));
  }
  async function save(){try{await ctx.storage.set('cfg',S)}catch(e){}}

  /* ── 分句纯函数 ──
     按句末 / 停顿标点切句；strip 时去掉句末标点。返回去空后的句子数组。 */
  function splitSentences(text,strip){
    var raw=String(text||'').replace(/\r/g,'');
    if(!raw.trim())return [];
    // 先按换行硬切，再按标点软切
    var parts=raw.split(/\n+/);
    var out=[];
    parts.forEach(function(p){
      var segs=p.match(/[^。！？!?；;，,、…]+[。！？!?；;，,、…]*|[。！？!?；;，,、…]+/g)||[];
      segs.forEach(function(s){
        s=s.trim();if(!s)return;
        if(strip)s=s.replace(/[。！？!?，,、；;…\s]+$/,'');
        if(s)out.push(s);
      });
    });
    // 过短的残句（1 字且无标点）并入前一句，避免单字气泡
    var merged=[];
    out.forEach(function(s){
      var prev=merged[merged.length-1];
      if(prev&&s.length<=1&&!/[。！？!?]$/.test(prev)){merged[merged.length-1]=prev+s}else{merged.push(s)}
    });
    return merged;
  }
  function punct(strip){return strip?'移除':'保留'}

  /* ── 提示词注入（官方 sys 通道）── */
  function applySys(){
    try{
      if(S.enabled&&String(S.prompt||'').trim()){
        ctx.sys.set(String(S.prompt).trim().slice(0,4000),{cfgId:S.bindCfgId||''});
      }else{ctx.sys.clear()}
    }catch(e){}
  }

  /* ── 绑定角色卡 ── */
  async function loadCfgs(){
    try{cfgList=await ctx.chat.list()}catch(e){cfgList=[]}
  }
  function bindName(){
    var c=cfgList.find(function(x){return x.id===S.bindCfgId});
    return c?c.name:'';
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
      /* 开关 */
      '.wm-sw{flex:none;width:50px;height:30px;border-radius:16px;background:var(--o2in);border:1px solid var(--o2line);position:relative;cursor:pointer;transition:background .15s}',
      '.wm-sw::after{content:"";position:absolute;top:2px;left:2px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .15s}',
      '.wm-sw.on{background:var(--o2acc);border-color:var(--o2acc)}',
      '.wm-sw.on::after{left:22px}',
      /* 滑块 */
      '.wm-slider{margin-top:10px}',
      '.wm-slider .wm-val{font-size:0.78rem;color:var(--o2tx2);text-align:center;margin-bottom:6px}',
      '.wm-slider input[type=range]{width:100%;accent-color:var(--o2acc)}',
      '.wm-scale{display:flex;justify-content:space-between;font-size:0.7rem;color:var(--o2tx2);margin-top:2px}',
      /* 按钮 */
      '.wm-bind{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:13px 12px;border-radius:14px;border:1px solid var(--o2line);background:var(--o2in);color:var(--o2tx);font-size:0.88rem;cursor:pointer}',
      '.wm-bind.on{border-color:var(--o2acc);color:var(--o2acc)}',
      '.wm-bind svg{width:18px;height:18px}',
      /* 输入 */
      '.wm-field{margin-top:10px}',
      '.wm-field label{display:block;font-size:0.72rem;color:var(--o2tx2);margin-bottom:5px}',
      '.wm-field textarea{width:100%;box-sizing:border-box;padding:10px 11px;border-radius:12px;border:1px solid var(--o2line);background:var(--o2in);color:var(--o2tx);font-size:0.86rem;font-family:inherit;resize:vertical;min-height:96px;line-height:1.6}',
      '.wm-note{margin-top:6px;font-size:0.72rem;line-height:1.5;color:var(--o2tx2)}',
      /* 预览 */
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

    /* 开关 */
    Array.prototype.forEach.call(host.querySelectorAll('.wm-sw'),function(sw){
      var k=sw.getAttribute('data-k');
      sw.classList.toggle('on',!!S[k]);
      sw.addEventListener('click',function(){
        S[k]=!S[k];sw.classList.toggle('on',S[k]);save();applySys();paintPrev();
      });
    });

    /* 滑块：合并间隔 */
    var gap=q('#wm-gap');
    gap.addEventListener('input',function(){S.mergeGap=Number(gap.value);q('#wm-gap-val').textContent='当前：'+S.mergeGap+'ms';save()});

    /* 滑块：打字速度 */
    var typ=q('#wm-type');
    typ.addEventListener('input',function(){S.typeMs=Number(typ.value);q('#wm-type-val').textContent='当前速度：每秒 '+(1000/S.typeMs).toFixed(1)+' 字符 · 当前：'+S.typeMs+'ms/字符';save()});

    /* 提示词 */
    q('#wm-prompt').addEventListener('input',function(){S.prompt=this.value;save();applySys()});

    /* 绑定角色卡 */
    q('#wm-bind').addEventListener('click',bindPicker);

    /* 预览 */
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
    save();applySys();render();
    toast(S.bindCfgId?'已绑定角色卡':'已解除绑定');
  }

  function paintPrev(){
    var box=q('#wm-prev-out');if(!box)return;
    var src=q('#wm-prev-src').value;
    var list=splitSentences(src,S.stripPunct);
    if(!src.trim()){box.innerHTML='<div class="wm-empty">还没有内容可预览</div>';return}
    if(!list.length){box.innerHTML='<div class="wm-empty">没有可拆分的句子</div>';return}
    box.innerHTML='<div class="wm-note">共 '+list.length+' 个气泡</div>'+
      list.map(function(s){return '<div class="wm-prev-bub ai">'+esc(s)+'</div>'}).join('');
  }

  IBApps.register({
    id:'waifumode',name:'Waifu模式',version:'1.0.0',sdk:2,wall:true,
    icon:'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.38 8.38 0 0 1 8 8z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/>',
    mount:async function(h,c){
      host=h;ctx=c;css();host.style.padding='0';host.style.overflow='hidden';
      await load();await loadCfgs();if(!host)return;render();applySys();
    },
    back:function(){return false},
    unmount:function(){
      try{ctx&&ctx.sys.clear()}catch(e){}
      host=null;ctx=null;
      var old=document.getElementById('wm-css');if(old)old.remove();
    }
  });
})();

/* ── 后续接入运行时拆泡 / 合并发送的调研结论（本期未挂载，待底座开放官方钩子）──
   已实测底座全局可达：sendMsg / _msgs / _activeCfg / buildMsgEl / redrawMsg / dbPut / convEl / pinBottom / genReply。
   · 拆泡：监听底座派发的 message 事件（ctx.on('message',am)），仅处理 role==='assistant' 且无 mark/topicBack/voice/images/files/sticker/link/mapRun/wsResults 的纯文本回复；
     分句后把首句写回 am.content 并 redrawMsg(am)，其余句子复制 am 字段、新 id 与递增 timestamp，dbPut('chatMessages',…) → _msgs.push → box.appendChild(buildMsgEl(新条))，按 typeMs×字数 延迟逐条出现；thinking/usage/memHit/wsSearches 只挂首条。
   · 合并发送：包装 window.sendMsg；enabled&&mergeOn 且匹配绑定时，把 ta 文本攒入缓冲、清空输入框、重置 mergeGap 定时器，到点合并为一条写回 ta.value 再调原始 sendMsg；附件（图/文件/表情/引用）消息直接放行不攒。卸载时还原 window.sendMsg。
   · 风险：工具连续调用、自动续写(truncated)、思考链、群聊、历史回灌；须在底座回复落库前预留改写钩子，否则直连消息库易与历史/摘要/缓存不一致。
*/
