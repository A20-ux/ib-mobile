/* IB 桌面 APP · 查岗通话 v1.0.0 —— 图 5 那张「屏幕共享 · 截图查岗」通话卡。
   网页版能做的都做进去：
     · 屏幕共享：getDisplayMedia 把真实屏幕投进卡里（浏览器/手机都会弹授权）
     · 截图查岗：从共享画面里截一帧，直接作为图片发给他（不共享也能选一张图发）
     · 通话计时、消息随聊天气泡滚动、译 / 吃醋 / 拽回 / 重试发送 / 主动开口
   纯前端，不需要后端；关掉即还原，不常驻。 */
(function(){
  if(!window.IBApps)return;
  var host=null,ctx=null;
  var ui={},st={t0:0,tid:0,mid:0,stream:null,lastUser:'',mic:false,polling:0,list:[]};
  var CFG_KEY='app_intercom_cfg';
  var S={autoShot:0,pick:'ta'};

  function q(s){return host?host.querySelector(s):null}
  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function toast(t){try{ctx.ui.toast(t)}catch(e){}}

  function activeCfg(){try{return (typeof _activeCfg!=='undefined'&&_activeCfg)?_activeCfg:null}catch(e){return null}}
  function cfgName(c){try{return typeof cfgName==='function'?cfgName(c):(c.name||c.title||'TA')}catch(e){return 'TA'}}

  /* ── 通话计时 ── */
  function fmt(ms){var s=Math.max(0,Math.floor(ms/1000));return ('0'+Math.floor(s/60)).slice(-2)+':'+('0'+(s%60)).slice(-2)}
  function tick(){
    var el=q('#ic-clock');if(!el)return;
    el.textContent='截图查岗 · '+fmt(Date.now()-st.t0);
  }

  /* ── 消息 ── */
  async function refreshMsgs(){
    if(!ctx)return;
    var rows=[];
    try{rows=await ctx.chat.recent(30)}catch(e){rows=[]}
    if(!rows||!rows.length)return;
    var box=q('#ic-msgs');if(!box)return;
    var lastId=box.dataset.last||'';
    var cut=rows.findIndex(function(r){return r.id===lastId});
    var add=cut>=0?rows.slice(cut+1):rows;
    if(!add.length)return;
    add.forEach(function(m){box.appendChild(bubbleOf(m));});
    box.dataset.last=rows[rows.length-1].id;
    box.scrollTop=box.scrollHeight;
    /* 重试发送记下最后一条自己的话 */
    for(var i=rows.length-1;i>=0;i--){if(rows[i].role==='user'){st.lastUser=String(rows[i].content||'');break}}
  }
  function bubbleOf(m){
    var isU=m.role==='user';
    var row=document.createElement('div');row.className='ic-row '+(isU?'u':'a');
    var b=document.createElement('div');b.className='ic-bub'+(isU?' u':'');
    b.textContent=String(m.content||'');
    if(m.hasImg){var i=document.createElement('div');i.className='ic-imgtag';i.textContent='· 带了一张图';b.appendChild(i)}
    row.appendChild(b);return row;
  }

  /* ── 屏幕共享 ── */
  async function startShare(){
    try{
      if(!navigator.mediaDevices||!navigator.mediaDevices.getDisplayMedia){toast('这个环境不支持屏幕共享，改用「发截图」');return false}
      var s=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:6},audio:false});
      st.stream=s;
      var v=q('#ic-video');if(v){v.srcObject=s;v.hidden=false;try{v.play()}catch(e){}}
      var ph=q('#ic-ph');if(ph)ph.style.display='none';
      var btn=q('#ic-share');if(btn)btn.textContent='停止共享';
      s.getVideoTracks().forEach(function(t){t.onended=function(){stopShare()}});
      return true;
    }catch(e){
      toast('没拿到屏幕授权——直接发截图给他也一样');
      return false;
    }
  }
  function stopShare(){
    try{if(st.stream)st.stream.getTracks().forEach(function(t){try{t.stop()}catch(e){}})}catch(e){}
    st.stream=null;
    var v=q('#ic-video');if(v){try{v.srcObject=null}catch(e){}v.hidden=true}
    var ph=q('#ic-ph');if(ph)ph.style.display='';
    var btn=q('#ic-share');if(btn)btn.textContent='开始共享屏幕';
  }
  /* 从共享画面截一帧，作为图片发出去 */
  async function shot(){
    if(!st.stream){toast('先点「开始共享屏幕」，或者直接选一张截图');return}
    try{
      var v=q('#ic-video');if(!v||!v.videoWidth){toast('还没画面，等他缓一下');return}
      var c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;
      c.getContext('2d').drawImage(v,0,0,c.width,c.height);
      var url=c.toDataURL('image/jpeg',0.82);
      await sendWithImage('截了一张当前屏幕',url);
      flash();
    }catch(e){toast('截图失败：'+((e&&e.message)||e))}
  }
  function flash(){var el=q('#ic-wrap');if(!el)return;el.classList.add('fl');setTimeout(function(){el.classList.remove('fl')},420)}
  function pickFile(){
    var inp=q('#ic-file');if(inp)inp.click();
  }
  async function sendWithImage(text,url){
    try{await ctx.chat.send(text,{images:[url]});toast('已发给他');refreshMsgs()}catch(e){toast('发送失败：'+((e&&e.message)||e))}
  }
  async function sendText(){
    var inp=q('#ic-in');if(!inp)return;
    var t=String(inp.value||'').trim();if(!t)return;
    inp.value='';
    try{await ctx.chat.send(t);refreshMsgs()}catch(e){toast('发送失败：'+((e&&e.message)||e))}
  }

  /* ── 底部那几个键 ── */
  async function translateLast(){
    var msgs=[];try{msgs=await ctx.chat.recent(8)}catch(e){}
    var last=null;for(var i=msgs.length-1;i>=0;i--){if(msgs[i].role!=='user'){last=msgs[i];break}}
    if(!last){toast('还没有他的话可翻');return}
    toast('正在翻…');
    try{
      var out=await ctx.ai.call('把下面这句话翻译成自然的中文，只输出译文，不要解释：\n'+String(last.content||''));
      var box=q('#ic-msgs');
      if(box&&out){
        var n=document.createElement('div');n.className='ic-tr';n.textContent='译：'+out;
        box.appendChild(n);box.scrollTop=box.scrollHeight;
      }
    }catch(e){toast('翻不动：'+((e&&e.message)||e))}
  }
  async function quickSend(text){
    try{await ctx.chat.send(text);refreshMsgs()}catch(e){toast('发送失败')}
  }

  /* ── 样式 ── */
  function css(){
    var old=document.getElementById('ic-css');if(old)old.remove();
    var s=document.createElement('style');s.id='ic-css';
    s.textContent=[
      '#ic-wrap{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;background:linear-gradient(180deg,#0b1016,#070a10);color:#eaf0f8;font-family:inherit;overflow:hidden}',
      '#ic-wrap.fl{box-shadow:inset 0 0 0 2px rgba(255,255,255,.5)}',
      '#ic-tip{margin:10px 12px 0;padding:12px;border:1.5px dashed rgba(255,255,255,.22);border-radius:16px;text-align:center}',
      '#ic-tip b{display:block;font-size:0.96rem;font-weight:600;letter-spacing:.01em}',
      '#ic-tip small{display:block;margin-top:5px;font-size:0.72rem;color:rgba(230,238,250,.5);letter-spacing:.08em}',
      '#ic-card{margin:10px 12px 0;border-radius:22px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.10);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);overflow:hidden;display:flex;flex-direction:column;min-height:0;flex:1}',
      '#ic-head{display:flex;align-items:center;gap:10px;padding:12px 12px 10px}',
      '#ic-ava{width:46px;height:46px;border-radius:50%;flex:none;background:#243040 center/cover no-repeat;border:1px solid rgba(255,255,255,.18)}',
      '#ic-who{flex:1;min-width:0}',
      '#ic-name{font-size:1.02rem;font-weight:650;display:flex;align-items:center;gap:6px}',
      '#ic-dot{width:7px;height:7px;border-radius:50%;background:#ff4d63;box-shadow:0 0 8px rgba(255,77,99,.8)}',
      '#ic-clock{font-size:0.76rem;color:rgba(228,238,252,.55);margin-top:2px}',
      '.ic-key{width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#eef4fd;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none}',
      '.ic-key svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}',
      '.ic-key.end{background:#ff4557;border-color:#ff4557;box-shadow:0 6px 18px rgba(255,69,87,.4)}',
      '#ic-stage{position:relative;margin:0 12px;border-radius:14px;overflow:hidden;background:#000;min-height:0}',
      '#ic-video{width:100%;max-height:150px;object-fit:contain;display:block;background:#000}',
      '#ic-ph{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;font-size:0.8rem;color:rgba(230,238,250,.5);border:1px dashed rgba(255,255,255,.14);border-radius:14px}',
      '#ic-msgs{flex:1;min-height:90px;overflow:auto;padding:10px 12px 4px;display:flex;flex-direction:column;gap:8px}',
      '.ic-row{display:flex}.ic-row.u{justify-content:flex-end}',
      '.ic-bub{max-width:78%;padding:10px 14px;border-radius:18px;font-size:0.92rem;line-height:1.66;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.10);white-space:pre-wrap;word-break:break-word}',
      '.ic-bub.u{background:rgba(255,255,255,.12)}',
      '.ic-imgtag{display:inline-block;margin-top:4px;font-size:0.7rem;color:rgba(230,240,255,.5)}',
      '.ic-tr{align-self:flex-start;max-width:88%;padding:8px 12px;border-radius:12px;border:1px dashed rgba(255,255,255,.16);font-size:0.82rem;line-height:1.6;color:rgba(235,243,255,.75)}',
      '#ic-tools{display:flex;gap:8px;padding:6px 12px 0}',
      '.ic-toolbtn{flex:1;padding:9px 0;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.055);color:#e8f0fb;font-size:0.78rem;cursor:pointer}',
      '#ic-inrow{display:flex;gap:8px;align-items:center;padding:8px 12px}',
      '#ic-in{flex:1;min-width:0;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;font-family:inherit;font-size:0.9rem;outline:none}',
      '#ic-in::placeholder{color:rgba(230,238,250,.4)}',
      '#ic-send{flex:none;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.1);color:#fff;cursor:pointer}',
      '#ic-chips{display:flex;gap:8px;padding:0 12px 12px;overflow:auto}',
      '.ic-chip{flex:none;padding:9px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#eef4fd;font-size:0.82rem;cursor:pointer;white-space:nowrap}',
      '.ic-chip.on{background:rgba(120,170,255,.24);border-color:rgba(120,170,255,.5)}',
      '.ic-chip.green{background:rgba(56,150,90,.35);border-color:rgba(70,180,110,.5)}',
      '.ic-chip.blue{background:rgba(80,110,200,.35);border-color:rgba(110,140,230,.55)}',
      '#ic-file{display:none}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function ico(p){return '<svg viewBox="0 0 24 24">'+p+'</svg>'}

  function render(){
    var cfg=activeCfg();
    if(!cfg){renderPick();return}
    var av='';try{av=(ctx.chat.avatars()||{}).ta||''}catch(e){}
    host.innerHTML=
      '<div id="ic-wrap">'
      +'<div id="ic-tip"><b>屏幕共享 · 让他看你的真实屏幕</b><small>网页版只能发截图 · 点下面就能共享或选图</small></div>'
      +'<div id="ic-card">'
        +'<div id="ic-head">'
          +'<div id="ic-ava" style="'+(av?'background-image:url(&quot;'+String(av).replace(/"/g,'')+'&quot;);':'')+'"></div>'
          +'<div id="ic-who"><div id="ic-name">'+esc(cfgName(cfg))+'<span id="ic-dot"></span></div><div id="ic-clock">截图查岗 · 00:00</div></div>'
          +'<button type="button" class="ic-key" id="ic-mic" title="话筒">'+ico('<path d="M12 15a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v5.5A3.5 3.5 0 0 0 12 15z"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/>')+'</button>'
          +'<button type="button" class="ic-key" id="ic-share" title="共享屏幕">'+ico('<rect x="3.5" y="4.5" width="17" height="12" rx="2"/><path d="M8 20h8"/>')+'</button>'
          +'<button type="button" class="ic-key end" id="ic-end" title="挂断">'+ico('<path d="M4 14.5c2.2-2.2 5-3.5 8-3.5s5.8 1.3 8 3.5"/><path d="M4 14.5v2.2a1.3 1.3 0 0 0 1.6 1.3l2.2-.6a1.3 1.3 0 0 0 1-1.5l-.2-1.2"/><path d="M20 14.5v2.2a1.3 1.3 0 0 1-1.6 1.3l-2.2-.6a1.3 1.3 0 0 1-1-1.5l.2-1.2"/>')+'</button>'
        +'</div>'
        +'<div id="ic-stage"><video id="ic-video" playsinline muted hidden></video><div id="ic-ph">还没在共享 · 点右上角那个屏幕图标</div></div>'
        +'<div id="ic-msgs"></div>'
        +'<div id="ic-tools">'
          +'<button type="button" class="ic-toolbtn" id="ic-shot">截一帧发给他</button>'
          +'<button type="button" class="ic-toolbtn" id="ic-pick">挑一张图发</button>'
        +'</div>'
        +'<div id="ic-inrow"><input id="ic-in" placeholder="他在看你的屏幕…" autocomplete="off"><button type="button" id="ic-send" title="发送">'+ico('<path d="M4 12l16-7-6.5 16-2-6.5z"/>')+'</button></div>'
        +'<div id="ic-chips">'
          +'<button type="button" class="ic-chip" id="ic-voice">话筒</button>'
          +'<button type="button" class="ic-chip" id="ic-active">主动</button>'
          +'<button type="button" class="ic-chip blue" id="ic-tr">译</button>'
          +'<button type="button" class="ic-chip green" id="ic-jea">吃醋</button>'
          +'<button type="button" class="ic-chip" id="ic-back">拽回</button>'
          +'<button type="button" class="ic-chip" id="ic-retry">重试发送</button>'
        +'</div>'
      +'</div>'
      +'<input type="file" id="ic-file" accept="image/*">'
      +'</div>';

    q('#ic-end').addEventListener('click',function(){hangup()});
    q('#ic-mic').addEventListener('click',function(){st.mic=!st.mic;this.style.background=st.mic?'rgba(120,170,255,.28)':'';toast(st.mic?'话筒开（这里没有收音，只是状态）':'话筒关')});
    q('#ic-share').addEventListener('click',function(){if(st.stream)stopShare();else startShare()});
    q('#ic-shot').addEventListener('click',function(){shot()});
    q('#ic-pick').addEventListener('click',function(){pickFile()});
    q('#ic-file').addEventListener('change',async function(){
      var f=this.files&&this.files[0];if(!f)return;
      var u=await new Promise(function(res){var r=new FileReader();r.onload=function(){res(r.result)};r.readAsDataURL(f)});
      this.value='';
      await sendWithImage('给你看这个',u);
    });
    q('#ic-send').addEventListener('click',sendText);
    q('#ic-in').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();sendText()}});
    q('#ic-voice').addEventListener('click',function(){this.classList.toggle('on');toast('语音条在聊天页那边发')});
    q('#ic-active').addEventListener('click',async function(){
      try{var ok=await ctx.chat.nudge({content:'（主动开口）'});toast(ok===false?'他正在说话，等一下':'已让他主动找你');refreshMsgs()}catch(e){toast('现在不能主动开口')}
    });
    q('#ic-tr').addEventListener('click',translateLast);
    q('#ic-jea').addEventListener('click',function(){quickSend('你今天跟谁聊这么久。')});
    q('#ic-back').addEventListener('click',function(){quickSend('回来，别在那边了。')});
    q('#ic-retry').addEventListener('click',async function(){
      if(!st.lastUser){toast('还没有可重试的话');return}
      try{await ctx.chat.send(st.lastUser);toast('已重发');refreshMsgs()}catch(e){toast('重发失败')}
    });

    st.t0=Date.now();
    clearInterval(st.tid);st.tid=setInterval(tick,1000);tick();
    clearInterval(st.polling);st.polling=setInterval(function(){refreshMsgs()},1500);
    refreshMsgs();
  }

  /* 没打开任何对话：先让他选一个 */
  async function renderPick(){
    var list=[];try{list=await ctx.chat.list()}catch(e){}
    host.innerHTML='<div id="ic-wrap"><div id="ic-tip"><b>先挑一个人</b><small>通话要挂在某个对话上</small></div>'
      +'<div style="padding:12px;display:flex;flex-direction:column;gap:10px;overflow:auto">'
      +(list.length?list.map(function(c){return '<button type="button" class="ic-chip" data-cid="'+esc(c.id)+'" style="text-align:left;padding:14px 16px">'+esc(c.name||'对话')+'</button>'}).join(''):'<div style="color:rgba(230,238,250,.5);font-size:.84rem;padding:10px">还没有对话</div>')
      +'</div></div>';
    Array.prototype.forEach.call(host.querySelectorAll('[data-cid]'),function(b){
      b.addEventListener('click',async function(){
        try{await ctx.chat.open(b.getAttribute('data-cid'));render()}catch(e){toast('打不开这个对话')}
      });
    });
    if(list.length===1){try{await ctx.chat.open(list[0].id);render()}catch(e){}}
  }

  function hangup(){
    try{stopShare()}catch(e){}
    clearInterval(st.tid);clearInterval(st.polling);
    toast('通话结束');
    try{ctx.ui.close()}catch(e){}
  }

  IBApps.register({
    id:'intercom',name:'查岗通话',version:'1.0.0',sdk:2,wall:true,headless:true,
    icon:'<path d="M4 14.5c2.2-2.2 5-3.5 8-3.5s5.8 1.3 8 3.5"/><path d="M4 14.5v2.2a1.3 1.3 0 0 0 1.6 1.3l2.2-.6a1.3 1.3 0 0 0 1-1.5l-.2-1.2"/><path d="M20 14.5v2.2a1.3 1.3 0 0 1-1.6 1.3l-2.2-.6a1.3 1.3 0 0 1-1-1.5l.2-1.2"/>',
    mount:async function(h,c){
      host=h;ctx=c;css();host.style.padding='0';host.style.overflow='hidden';
      render();
    },
    back:function(){hangup();return true},
    unmount:function(){
      try{stopShare()}catch(e){}
      clearInterval(st.tid);clearInterval(st.polling);
      host=null;ctx=null;
      var old=document.getElementById('ic-css');if(old)old.remove();
    }
  });
})();
