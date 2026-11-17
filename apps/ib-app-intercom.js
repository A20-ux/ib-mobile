/* IB 桌面 APP · 查岗通话 v1.1.0 —— 图 5 那张「屏幕共享 · 截图查岗」通话卡。
   v1.1.0 重做屏幕共享：
     · 不再点一下就共享——先弹「允许他看你的屏幕？」确认，同意了才向系统要授权
     · 画面进一个**可拖动的悬浮小窗**（固定在页面最上层），关掉这个 APP 也不消失，
       你切到别的页面、别的对话，它都在那儿，他看的就是你正在看的
     · 小窗能放大/缩小/收起，随时从画面里截一帧发给他
   说明：网页版的小窗只能悬在本站页面上（浏览器安全限制，盖不到别的 App），
   要真正盖住整个手机得装安卓壳那边的悬浮窗权限。 */
(function(){
  if(!window.IBApps)return;
  var host=null,ctx=null;
  var st={t0:0,tid:0,polling:0,lastUser:'',mic:false};

  /* ── 全局共享态（跨面板存活的悬浮窗） ── */
  var FZ={stream:null,wrap:null,big:false,name:'',av:'',clockT:0,drag:null,t0:0};

  function q(s){return host?host.querySelector(s):null}
  function dq(s){return document.querySelector(s)}
  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function toast(t){try{ctx&&ctx.ui.toast?ctx.ui.toast(t):0}catch(e){}}
  function activeCfg(){try{return (typeof _activeCfg!=='undefined'&&_activeCfg)?_activeCfg:null}catch(e){return null}}
  function cfgName(c){try{return typeof cfgName==='function'?cfgName(c):(c&&(c.name||c.title))||'TA'}catch(e){return 'TA'}}
  function fmt(ms){var s=Math.max(0,Math.floor(ms/1000));return ('0'+Math.floor(s/60)).slice(-2)+':'+('0'+(s%60)).slice(-2)}

  /* ═══════════ 悬浮小窗 ═══════════ */
  function fzCSS(){
    if(document.getElementById('icf-css'))return;
    var s=document.createElement('style');s.id='icf-css';
    s.textContent=[
      '#icf{position:fixed;right:12px;bottom:96px;width:152px;z-index:2147483000;border-radius:16px;overflow:hidden;',
      'background:rgba(12,16,22,.92);border:1px solid rgba(255,255,255,.16);box-shadow:0 14px 40px rgba(0,0,0,.6);',
      'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);touch-action:none;user-select:none;transition:width .18s}',
      '#icf.big{width:min(70vw,320px)}',
      '#icf-bar{display:flex;align-items:center;gap:6px;padding:7px 8px;cursor:grab;background:rgba(255,255,255,.06)}',
      '#icf-bar:active{cursor:grabbing}',
      '#icf-ava{width:18px;height:18px;border-radius:50%;flex:none;background:#2a3648 center/cover no-repeat;border:1px solid rgba(255,255,255,.2)}',
      '#icf-nm{flex:1;min-width:0;font-size:.72rem;color:#eef4fd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#icf-live{width:6px;height:6px;border-radius:50%;background:#ff4d63;flex:none;box-shadow:0 0 6px rgba(255,77,99,.9);animation:icfP 1.6s infinite}',
      '@keyframes icfP{0%,100%{opacity:.35}50%{opacity:1}}',
      '#icf-x{flex:none;width:20px;height:20px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:none;color:#dfe8f5;font-size:.7rem;cursor:pointer;line-height:1}',
      '#icf-v{display:block;width:100%;background:#000;max-height:210px;object-fit:contain}',
      '#icf-ft{display:flex;gap:5px;padding:6px 7px}',
      '.icf-b{flex:1;padding:6px 0;border-radius:9px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.07);color:#eef4fd;font-size:.68rem;cursor:pointer}',
      '.icf-b.end{background:rgba(255,69,87,.28);border-color:rgba(255,69,87,.5)}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function fzBuild(){
    fzCSS();
    if(FZ.wrap&&FZ.wrap.isConnected)return;
    var w=document.createElement('div');w.id='icf';
    w.innerHTML='<div id="icf-bar">'
      +'<span id="icf-ava"></span><span id="icf-nm">'+esc(FZ.name||'TA')+'</span>'
      +'<span id="icf-live"></span>'
      +'<button type="button" id="icf-x" title="停止共享">✕</button>'
      +'</div>'
      +'<video id="icf-v" autoplay muted playsinline></video>'
      +'<div id="icf-ft"><button type="button" class="icf-b" id="icf-big">放大</button><button type="button" class="icf-b end" id="icf-stop">停止</button></div>';
    document.body.appendChild(w);
    FZ.wrap=w;
    try{if(FZ.av)w.querySelector('#icf-ava').style.backgroundImage='url("'+FZ.av+'")'}catch(e){}

    /* 拖动：整个窗都能拖，抓在顶栏更稳 */
    var bar=w.querySelector('#icf-bar');
    function down(e){
      var r=w.getBoundingClientRect();
      FZ.drag={dx:(e.touches?e.touches[0].clientX:e.clientX)-r.left,dy:(e.touches?e.touches[0].clientY:e.clientY)-r.top};
      w.style.left=r.left+'px';w.style.top=r.top+'px';w.style.right='auto';w.style.bottom='auto';
      e.preventDefault();
      document.addEventListener('mousemove',move,{passive:false});
      document.addEventListener('touchmove',move,{passive:false});
      document.addEventListener('mouseup',up);
      document.addEventListener('touchend',up);
    }
    function move(e){
      if(!FZ.drag)return;
      var cx=e.touches?e.touches[0].clientX:e.clientX, cy=e.touches?e.touches[0].clientY:e.clientY;
      var maxX=window.innerWidth-60, maxY=window.innerHeight-60;
      var x=Math.max(-40,Math.min(maxX,cx-FZ.drag.dx)), y=Math.max(0,Math.min(maxY,cy-FZ.drag.dy));
      w.style.left=x+'px';w.style.top=y+'px';
      e.preventDefault();
    }
    function up(){FZ.drag=null;document.removeEventListener('mousemove',move);document.removeEventListener('touchmove',move);document.removeEventListener('mouseup',up);document.removeEventListener('touchend',up)}
    bar.addEventListener('mousedown',down);
    bar.addEventListener('touchstart',down,{passive:false});

    w.querySelector('#icf-x').addEventListener('click',function(e){e.stopPropagation();stopShare()});
    w.querySelector('#icf-stop').addEventListener('click',function(){stopShare()});
    w.querySelector('#icf-big').addEventListener('click',function(){
      FZ.big=!FZ.big;w.classList.toggle('big',FZ.big);this.textContent=FZ.big?'缩小':'放大';
    });

    var v=w.querySelector('#icf-v');
    if(FZ.stream){try{v.srcObject=FZ.stream;v.play()}catch(e){}}
  }

  /* 确认 → 系统授权 → 起悬浮窗 */
  async function askAndShare(){
    var cfg=activeCfg();
    var who=cfg?cfgName(cfg):'TA';
    var ok=true;
    try{
      if(ctx&&ctx.ui&&ctx.ui.confirm)ok=await ctx.ui.confirm('允许 '+who+' 看你的真实屏幕？\n共享期间你打开什么他都能看到，小窗可以拖到任意位置，随时能停。','允许共享');
    }catch(e){ok=true}
    if(!ok){toast('没共享');return false}

    if(!navigator.mediaDevices||!navigator.mediaDevices.getDisplayMedia){
      toast('这个环境不支持屏幕共享，改用「发截图」');return false;
    }
    try{
      var s=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:8},audio:false});
      FZ.stream=s;
      FZ.name=who;
      try{FZ.av=(ctx.chat.avatars()||{}).ta||''}catch(e){FZ.av=''}
      FZ.t0=Date.now();
      fzBuild();
      s.getVideoTracks().forEach(function(t){t.onended=function(){stopShare()}});
      toast('开始共享 · 小窗可以拖着走');
      renderState();
      return true;
    }catch(e){
      toast('没拿到屏幕授权——直接发截图给他也一样');
      return false;
    }
  }

  function stopShare(){
    try{if(FZ.stream)FZ.stream.getTracks().forEach(function(t){try{t.stop()}catch(e){}})}catch(e){}
    FZ.stream=null;
    try{if(FZ.wrap){FZ.wrap.remove()}}catch(e){}
    FZ.wrap=null;
    toast('已停止共享');
    renderState();
  }

  /* ═══════════ 通话卡 ═══════════ */
  function tick(){
    var el=q('#ic-clock');if(el)el.textContent='截图查岗 · '+fmt(Date.now()-st.t0);
  }
  async function refreshMsgs(){
    if(!ctx)return;
    var rows=[];try{rows=await ctx.chat.recent(30)}catch(e){rows=[]}
    if(!rows||!rows.length)return;
    var box=q('#ic-msgs');if(!box)return;
    var lastId=box.dataset.last||'';
    var cut=rows.findIndex(function(r){return r.id===lastId});
    var add=cut>=0?rows.slice(cut+1):rows;
    if(!add.length)return;
    add.forEach(function(m){box.appendChild(bubbleOf(m))});
    box.dataset.last=rows[rows.length-1].id;
    box.scrollTop=box.scrollHeight;
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

  async function shot(){
    if(!FZ.stream){toast('先点「开始共享屏幕」，或者直接挑一张图');return}
    try{
      var v=dq('#icf-v')||q('#ic-video');
      if(!v||!v.videoWidth){toast('还没画面，等一下');return}
      var c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;
      c.getContext('2d').drawImage(v,0,0,c.width,c.height);
      await sendWithImage('截了一张我现在的屏幕',c.toDataURL('image/jpeg',0.82));
      toast('已发给他');
    }catch(e){toast('截图失败：'+((e&&e.message)||e))}
  }
  async function sendWithImage(text,url){try{await ctx.chat.send(text,{images:[url]});refreshMsgs()}catch(e){toast('发送失败：'+((e&&e.message)||e))}}
  async function sendText(){
    var inp=q('#ic-in');if(!inp)return;
    var t=String(inp.value||'').trim();if(!t)return;
    inp.value='';
    try{await ctx.chat.send(t);refreshMsgs()}catch(e){toast('发送失败：'+((e&&e.message)||e))}
  }
  async function translateLast(){
    var msgs=[];try{msgs=await ctx.chat.recent(8)}catch(e){}
    var last=null;for(var i=msgs.length-1;i>=0;i--){if(msgs[i].role!=='user'){last=msgs[i];break}}
    if(!last){toast('还没有他的话可翻');return}
    toast('正在翻…');
    try{
      var out=await ctx.ai.call('把下面这句话翻译成自然的中文，只输出译文，不要解释：\n'+String(last.content||''));
      var box=q('#ic-msgs');
      if(box&&out){var n=document.createElement('div');n.className='ic-tr';n.textContent='译：'+out;box.appendChild(n);box.scrollTop=box.scrollHeight}
    }catch(e){toast('翻不动：'+((e&&e.message)||e))}
  }
  async function quickSend(t){try{await ctx.chat.send(t);refreshMsgs()}catch(e){toast('发送失败')}}

  function css(){
    var old=document.getElementById('ic-css');if(old)old.remove();
    var s=document.createElement('style');s.id='ic-css';
    s.textContent=[
      '#ic-wrap{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;background:linear-gradient(180deg,#0b1016,#070a10);color:#eaf0f8;font-family:inherit;overflow:hidden}',
      '#ic-tip{margin:10px 12px 0;padding:12px;border:1.5px dashed rgba(255,255,255,.22);border-radius:16px;text-align:center}',
      '#ic-tip b{display:block;font-size:0.96rem;font-weight:600}',
      '#ic-tip small{display:block;margin-top:5px;font-size:0.72rem;color:rgba(230,238,250,.5);letter-spacing:.06em}',
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
      '#ic-state{margin:0 12px;padding:10px 12px;border-radius:12px;font-size:0.78rem;line-height:1.6;display:none}',
      '#ic-state.on{display:block;background:rgba(255,77,99,.10);border:1px solid rgba(255,77,99,.28);color:#ffb3bd}',
      '#ic-msgs{flex:1;min-height:80px;overflow:auto;padding:10px 12px 4px;display:flex;flex-direction:column;gap:8px}',
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

  function renderState(){
    var el=q('#ic-state');if(!el)return;
    if(FZ.stream){
      el.className='on';
      el.textContent='正在共享 · 小窗在页面右下角，可以拖到任意位置；关掉这个面板它也不会消失，点小窗上的 ✕ 或这里才能停。';
      var sb=q('#ic-share');if(sb)sb.textContent='停止共享';
    }else{
      el.className='';
      var sb2=q('#ic-share');if(sb2)sb2.textContent='共享屏幕';
    }
  }

  function render(){
    var cfg=activeCfg();
    if(!cfg){renderPick();return}
    var av='';try{av=(ctx.chat.avatars()||{}).ta||''}catch(e){}
    host.innerHTML=
      '<div id="ic-wrap">'
      +'<div id="ic-tip"><b>屏幕共享 · 让他看你的真实屏幕</b><small>点「共享屏幕」会先问你要不要给</small></div>'
      +'<div id="ic-card">'
        +'<div id="ic-head">'
          +'<div id="ic-ava" style="'+(av?'background-image:url(&quot;'+String(av).replace(/"/g,'')+'&quot;);':'')+'"></div>'
          +'<div id="ic-who"><div id="ic-name">'+esc(cfgName(cfg))+'<span id="ic-dot"></span></div><div id="ic-clock">截图查岗 · 00:00</div></div>'
          +'<button type="button" class="ic-key" id="ic-mic" title="话筒">'+ico('<path d="M12 15a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v5.5A3.5 3.5 0 0 0 12 15z"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3"/>')+'</button>'
          +'<button type="button" class="ic-key" id="ic-share" title="共享屏幕">'+ico('<rect x="3.5" y="4.5" width="17" height="12" rx="2"/><path d="M8 20h8"/>')+'</button>'
          +'<button type="button" class="ic-key end" id="ic-end" title="挂断">'+ico('<path d="M4 14.5c2.2-2.2 5-3.5 8-3.5s5.8 1.3 8 3.5"/><path d="M4 14.5v2.2a1.3 1.3 0 0 0 1.6 1.3l2.2-.6a1.3 1.3 0 0 0 1-1.5l-.2-1.2"/><path d="M20 14.5v2.2a1.3 1.3 0 0 1-1.6 1.3l-2.2-.6a1.3 1.3 0 0 1-1-1.5l.2-1.2"/>')+'</button>'
        +'</div>'
        +'<div id="ic-state"></div>'
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
    q('#ic-mic').addEventListener('click',function(){st.mic=!st.mic;this.style.background=st.mic?'rgba(120,170,255,.28)':'';toast(st.mic?'话筒开（网页版没有收音，只是状态）':'话筒关')});
    q('#ic-share').addEventListener('click',function(){if(FZ.stream)stopShare();else askAndShare()});
    q('#ic-shot').addEventListener('click',shot);
    q('#ic-pick').addEventListener('click',function(){var i=q('#ic-file');if(i)i.click()});
    q('#ic-file').addEventListener('change',async function(){
      var f=this.files&&this.files[0];if(!f)return;
      var u=await new Promise(function(res){var r=new FileReader();r.onload=function(){res(r.result)};r.readAsDataURL(f)});
      this.value='';await sendWithImage('给你看这个',u);
    });
    q('#ic-send').addEventListener('click',sendText);
    q('#ic-in').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();sendText()}});
    q('#ic-voice').addEventListener('click',function(){this.classList.toggle('on');toast('语音条在聊天页发')});
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

    st.t0=Date.now();clearInterval(st.tid);st.tid=setInterval(tick,1000);tick();
    clearInterval(st.polling);st.polling=setInterval(function(){refreshMsgs()},1500);
    refreshMsgs();renderState();
  }

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
    stopShare();clearInterval(st.tid);clearInterval(st.polling);
    toast('通话结束');
    try{ctx.ui.close()}catch(e){}
  }

  IBApps.register({
    id:'intercom',name:'查岗通话',version:'1.1.0',sdk:2,wall:true,headless:true,
    icon:'<path d="M4 14.5c2.2-2.2 5-3.5 8-3.5s5.8 1.3 8 3.5"/><path d="M4 14.5v2.2a1.3 1.3 0 0 0 1.6 1.3l2.2-.6a1.3 1.3 0 0 0 1-1.5l-.2-1.2"/><path d="M20 14.5v2.2a1.3 1.3 0 0 1-1.6 1.3l-2.2-.6a1.3 1.3 0 0 1-1-1.5l.2-1.2"/>',
    mount:async function(h,c){
      host=h;ctx=c;css();host.style.padding='0';host.style.overflow='hidden';
      render();
    },
    back:function(){hangup();return true},
    unmount:function(){
      /* 关键：关面板不停止共享，悬浮小窗继续留在页面上 */
      clearInterval(st.tid);clearInterval(st.polling);
      host=null;ctx=null;
      var old=document.getElementById('ic-css');if(old)old.remove();
    }
  });
})();
