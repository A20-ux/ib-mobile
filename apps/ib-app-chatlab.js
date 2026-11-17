/* IB 桌面 APP · 聊天外观 v1.2.0 —— 接管 #cv-msgs 整套聊天气泡外观 + 时间分隔节奏。
   做三件事（脚本加载即生效，不随面板开关，面板只负责调参数）：
     1) 注入一套磨砂玻璃气泡皮肤（背景 / 模糊 / 圆角 / 内距 / 最大宽度 / 字号 / 头像 / 右上角装饰点）；
     2) 接管 _tmCollapse：时间标签只在「间隔超过 N 分钟」或换人说话时才出现，不是每条都挂；
     3) 松紧三档 + 精细滑杆，参数实时预览、存本 App 的 apiSettings。
   全部走 CSS 变量，不改 index.html 里任何一条气泡规则；卸载即还原。 */
(function(){
  if(!window.IBApps)return;
  var host=null,ctx=null;
  var S={
    on:true,preset:'night',
    gap:14,padX:19,padY:13,round:28,maxw:80,fs:1.0,lh:1.78,
    blur:26,sat:1.42,bri:0.96,bgA:0.045,lineA:0.17,txA:'#f2f6fc',
    dot:1,dotSize:7,ava:1,name:0,
    timeOn:1,timeGap:10
  };
  var A={installed:false,origCollapse:null};

  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function q(sel){return host?host.querySelector(sel):null}
  function toast(t){try{ctx.ui.toast(t)}catch(e){}}
  function glyph(name){try{return (typeof glyphOf==='function')?glyphOf(name):null}catch(e){return null}}

  /* ── 存取 ── */
  function _key(){return 'app_chatlab_cfg'}
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
  async function storageSet(v){try{await dbPut('apiSettings',{id:_key(),app:'chatlab',key:'cfg',v:v,updated:Date.now()})}catch(e){}}
  function clamp(v,a,b){return Math.min(b,Math.max(a,Number(v)||0))}
  async function load(){
    try{var v=await storageGet();if(v&&typeof v==='object')S=Object.assign(S,v)}catch(e){}
    S.gap=clamp(S.gap,2,20);S.padX=clamp(S.padX,10,24);S.padY=clamp(S.padY,7,18);
    S.round=clamp(S.round,4,30);S.maxw=clamp(S.maxw,70,95);S.fs=clamp(S.fs,0.8,1.12);S.lh=clamp(S.lh,1.4,1.9);
    S.blur=clamp(S.blur,0,40);S.sat=clamp(S.sat,1,2);S.bri=clamp(S.bri,0.7,1.4);S.bgA=clamp(S.bgA,0.0,0.24);
    S.lineA=clamp(S.lineA,0,0.4);S.dotSize=clamp(S.dotSize,3,12);
    S.timeGap=clamp(S.timeGap,1,60);
  }
  async function save(){
    try{await storageSet(S)}catch(e){try{ctx&&ctx.storage.set('cfg',S)}catch(e2){}}
  }

  /* ── 预设 ── */
  /* 数值对齐用户给的参考图：大圆角、宽内距、字稍大、描边淡而清楚、底色几乎透明靠模糊出质感 */
  var PRESETS={
    night:{  bgA:0.045,lineA:0.17,txA:'#f2f6fc',blur:26,sat:1.42,bri:0.96,round:28,maxw:80,fs:1.00,padX:19,padY:13,lh:1.78,dot:1,dotSize:7 },
    ink:{    bgA:0.02,lineA:0.22,txA:'#eaf0f8',blur:16,sat:1.20,bri:0.92,round:30,maxw:78,fs:0.98,padX:20,padY:13,lh:1.80,dot:1,dotSize:7 },
    day:{    bgA:0.62,lineA:0.26,txA:'#16233a',blur:18,sat:1.25,bri:1.05,round:26,maxw:82,fs:1.00,padX:19,padY:13,lh:1.76,dot:1,dotSize:6 },
    plain:{  bgA:0.01,lineA:0.10,txA:'#dfe6f2',blur:6, sat:1.05,bri:1.00,round:16,maxw:86,fs:0.96,padX:16,padY:11,lh:1.68,dot:0,dotSize:6 }
  };
  function applyPreset(k){
    var p=PRESETS[k];if(!p)return;
    S.preset=k;Object.keys(p).forEach(function(x){S[x]=p[x]});
    /* 松紧跟着走 */
    S.gap=(k==='plain'?8:(k==='night'?14:14))
    save();paint();
  }

  /* ── 生成皮肤 CSS ── */
  function bgOf(a){
    if(S.preset==='day')return 'rgba(255,255,255,'+a+')';
    return 'rgba(255,255,255,'+a+')';
  }
  function buildCSS(){
    var isDay=S.preset==='day';
    var bg=isDay?('rgba(252,254,255,'+S.bgA+')'):('rgba(255,255,255,'+S.bgA+')');
    var bgu=isDay?('rgba(226,238,252,'+(S.bgA+0.10)+')'):('rgba(255,255,255,'+(S.bgA+0.05)+')');
    var line=isDay?('rgba(120,150,190,'+(S.lineA+0.08).toFixed(3)+')'):('rgba(255,255,255,'+S.lineA+')');
    var lineu=isDay?('rgba(110,145,190,'+(S.lineA+0.12).toFixed(3)+')'):('rgba(255,255,255,'+(S.lineA+0.04).toFixed(3)+')');
    var shadow=isDay
      ?'0 6px 18px rgba(30,60,110,.10), inset 0 1px 0 rgba(255,255,255,.7)'
      :'0 10px 28px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.06)';
    var dotc=isDay?'rgba(90,130,185,.55)':'rgba(240,246,255,.46)';
    var css='';
    css+='#cv-msgs{gap:'+S.gap+'px}';
    css+='#cv-msgs .mrow{margin-bottom:'+Math.max(0,S.gap-7)+'px}';
    /* 宽度挂在 .m-col 上：.m 的 max-width 用百分比会以「已收缩的父列」为基准，
       结果自己把自己勒细（短句被迫竖排）。改成列限宽、气泡吃满列宽。 */
    css+='#cv-msgs .m-body .m-col{max-width:min('+S.maxw+'%,calc(100% - 46px))!important}';
    css+='#cv-msgs .m-body>.m{max-width:min('+S.maxw+'%,calc(100% - 46px))!important}';
    css+='#cv-msgs .m{position:relative;max-width:100%!important;'
      +'padding:'+S.padY+'px '+S.padX+'px!important;'
      +'border-radius:'+S.round+'px!important;'
      +'font-size:'+S.fs+'rem!important;line-height:'+S.lh+'!important;'
      +'background:'+bg+'!important;'
      +'border:1px solid '+line+'!important;'
      +'box-shadow:'+shadow+'!important;'
      +'color:'+S.txA+'!important;'
      +'-webkit-backdrop-filter:blur('+S.blur+'px) saturate('+S.sat+') brightness('+S.bri+');'
      +'backdrop-filter:blur('+S.blur+'px) saturate('+S.sat+') brightness('+S.bri+')}';
    /* 我的气泡：同质感、略亮一点 */
    css+='#cv-msgs .m.user{background:'+bgu+'!important;border-color:'+lineu+'!important}';
    /* 右上角装饰小圈 */
    var ds=S.dotSize;
    css+='#cv-msgs .m.ai::after{content:"";position:absolute;top:7px;right:'+(S.padX-4)+'px;width:'+ds+'px;height:'+ds+'px;border-radius:50%;border:1.2px solid '+dotc+';pointer-events:none;'
      +(S.dot?'opacity:.95':'display:none')+'}';
    css+='#cv-msgs .m.user::before{content:"";position:absolute;top:7px;left:'+(S.padX-4)+'px;width:'+ds+'px;height:'+ds+'px;border-radius:50%;border:1.2px solid '+dotc+';pointer-events:none;'
      +(S.dot?'opacity:.55':'display:none')+'}';
    /* 圆角方向：聊天气泡常见的「靠头像那个角更小」 */
    css+='#cv-msgs .m.ai{border-top-left-radius:'+Math.max(6,S.round-12)+'px!important}';
    css+='#cv-msgs .m.user{border-top-right-radius:'+Math.max(6,S.round-12)+'px!important}';
    /* 头像 / 名字 */
    if(!S.ava)css+='#cv-msgs .m-avaslot{display:none!important}#cv-msgs .mrow.hasava .m-gname{margin-left:0!important}';
    css+='#cv-msgs .m-avaslot .m-ava{box-shadow:0 2px 10px rgba(0,0,0,.35)}';
    if(!S.name)css+='#cv-msgs .mrow-head{display:none!important}';
    /* 时间标签：玻璃下的小字 */
    css+='#cv-msgs .m-time{color:'+(isDay?'rgba(70,100,140,.8)':'rgba(220,230,245,.55)')+'!important;font-size:0.64rem!important;margin:5px '+Math.max(6,S.padX-2)+'px 0!important}';
    /* 语音条保持同样的圆角语言 */
    css+='#cv-msgs .vm-stack .vmsg,#cv-msgs .vm-stack .ibvb{border-radius:'+Math.min(S.round,24)+'px!important}';
    return css;
  }
  function paint(){
    var st=document.getElementById('clab-css');
    if(!st){st=document.createElement('style');st.id='clab-css';document.head.appendChild(st)}
    st.textContent=S.on?buildCSS():'';
    /* 让时间按新间隔重算一遍 */
    runCollapse();
    try{paintPreview()}catch(e){}
  }

  /* ── 接管时间折叠 ── */
  function _mmOf(txt){
    var m=/(\d{1,2}):(\d{2})/.exec(String(txt||''));if(!m)return 0;
    return (parseInt(m[1],10)||0)*60+(parseInt(m[2],10)||0);
  }
  function _stampOf(row){
    var v=+row.dataset.ts||0;
    if(v)return v;
    var t=row.querySelector('.m-time');if(!t)return 0;
    var mm=_mmOf(t.textContent);return mm?mm*60000:0;/* 没有时间戳就退回读文本的 HH:MM */
  }
  /* 一个「时间块」只显示一次：与上一条间隔 < N 分钟就藏起来（显示在块首），不分左右 */
  function myCollapse(hostEl){
    try{
      var rows=[].slice.call(hostEl.querySelectorAll(':scope > .mrow'));
      function side(r){return r.querySelector('.m.user')?'u':(r.querySelector('.m.ai')?'a':'')}
      var gapMs=(Number(S.timeGap)||10)*60000, prev=null;
      for(var i=0;i<rows.length;i++){
        var t=rows[i].querySelector('.m-time');if(!t)continue;
        var s=side(rows[i]), ts=_stampOf(rows[i]), hide=false;
        if(!S.timeOn){hide=true}
        else if(prev&&prev.ts&&ts){
          var d=ts-prev.ts;if(d<0)d+=86400000;/* 跨零点 */
          if(d<gapMs)hide=true;
        }
        if(hide&&t.querySelector('.m-gb.hit'))hide=false;/* 这轮想起过的时间行不折 */
        t.classList.toggle('tm-hide',hide);
        prev={side:s,ts:ts};
      }
    }catch(e){}
  }
  function runCollapse(){
    try{
      var h=typeof convEl==='function'?convEl('cv-msgs'):document.getElementById('cv-msgs');
      if(h)myCollapse(h);
    }catch(e){}
  }
  /* 任何重渲染（新消息 / 翻页 / 切会话）都会重建行，用观察者兜住，保证时间始终按新规则 */
  var _obsT=0;
  function watch(){
    try{
      var h=document.getElementById('cv-msgs');if(!h){setTimeout(watch,500);return}
      if(h._clabObs)return;
      h._clabObs=1;
      var mo=new MutationObserver(function(){
        clearTimeout(_obsT);_obsT=setTimeout(function(){runCollapse()},180);
      });
      mo.observe(h,{childList:true,subtree:true});
    }catch(e){}
  }
  function install(){
    if(A.installed)return;
    try{
      if(typeof _tmCollapse==='function'){
        A.origCollapse=_tmCollapse;
        window._tmCollapse=myCollapse;
      }
    }catch(e){}
    A.installed=true;
    watch();
  }

  /* ── 预览 ── */
  function paintPreview(){
    var box=q('#clab-pv');if(!box)return;
    var isDay=S.preset==='day';
    var bg=isDay?('rgba(252,254,255,'+S.bgA+')'):('rgba(255,255,255,'+S.bgA+')');
    var bgu=isDay?('rgba(226,238,252,'+(S.bgA+0.10)+')'):('rgba(255,255,255,'+(S.bgA+0.05)+')');
    var line=isDay?'rgba(120,150,190,.28)':'rgba(255,255,255,.10)';
    var b='';
    function bub(txt,side){
      var s='position:relative;max-width:'+S.maxw+'%;padding:'+S.padY+'px '+S.padX+'px;border-radius:'+S.round+'px;'
        +'font-size:'+S.fs+'rem;line-height:'+S.lh+';color:'+S.txA+';'
        +'background:'+(side==='u'?bgu:bg)+';border:1px solid '+line+';'
        +'-webkit-backdrop-filter:blur('+S.blur+'px) saturate('+S.sat+') brightness('+S.bri+');'
        +'backdrop-filter:blur('+S.blur+'px) saturate('+S.sat+') brightness('+S.bri+');'
        +'box-shadow:0 10px 28px rgba(0,0,0,.38), inset 0 1px 0 rgba(255,255,255,.06);'
        +(side==='u'?'border-top-right-radius:'+Math.max(6,S.round-12)+'px;margin-left:auto':'border-top-left-radius:'+Math.max(6,S.round-12)+'px');
      return '<div style="'+s+'">'+esc(txt)+'</div>';
    }
    b+='<div style="display:flex;flex-direction:column;gap:'+S.gap+'px;padding:4px 2px">';
    b+=bub('行吧 我说话 你听着。现在两点半 歌快放完了。','a');
    b+=bub('听完了就动 别光听我声音吃这一套。','a');
    b+=bub('知道了','u');
    b+='</div>';
    b+='<div style="text-align:left;font-size:0.64rem;margin:6px 4px 0;color:'+(isDay?'rgba(70,100,140,.8)':'rgba(220,230,245,.55)')+'">07:52</div>';
    box.innerHTML=b;
  }

  /* ── 面板样式 ── */
  function css(){
    var old=document.getElementById('clab-ui');if(old)old.remove();
    var st=document.createElement('style');st.id='clab-ui';
    st.textContent=[
      '.clab-wrap{padding:14px;display:flex;flex-direction:column;gap:12px;box-sizing:border-box}',
      '.clab-card{padding:13px;border-radius:16px;background:var(--o2card);border:1px solid var(--o2line)}',
      '.clab-t{font-size:0.9rem;font-weight:700;color:var(--o2tx)}',
      '.clab-d{margin-top:3px;font-size:0.75rem;line-height:1.5;color:var(--o2tx2)}',
      '.clab-row{display:flex;align-items:center;justify-content:space-between;gap:12px}',
      '.clab-sw{flex:none;width:50px;height:30px;border-radius:16px;background:var(--o2in);border:1px solid var(--o2line);position:relative;cursor:pointer;transition:background .15s}',
      '.clab-sw::after{content:"";position:absolute;top:2px;left:2px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .15s}',
      '.clab-sw.on{background:var(--o2acc);border-color:var(--o2acc)}.clab-sw.on::after{left:22px}',
      '.clab-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
      '.clab-chip{flex:1 1 calc(50% - 8px);min-width:96px;padding:10px 6px;border-radius:12px;border:1px solid var(--o2line);background:var(--o2in);color:var(--o2tx2);font-size:0.8rem;cursor:pointer;text-align:center}',
      '.clab-chip.on{background:var(--o2acc);border-color:var(--o2acc);color:#fff;font-weight:700}',
      '.clab-slider{margin-top:12px}',
      '.clab-slider .v{font-size:0.76rem;color:var(--o2tx2);display:flex;justify-content:space-between;margin-bottom:6px}',
      '.clab-slider input[type=range]{width:100%;accent-color:var(--o2acc)}',
      '.clab-pv{position:relative;margin-top:12px;border-radius:14px;padding:14px 10px;overflow:hidden;background:radial-gradient(120% 90% at 20% 0%,#1b2743 0%,#0b1220 70%);border:1px solid rgba(255,255,255,.08)}',
      '.clab-pv.light{background:radial-gradient(120% 90% at 20% 0%,#eaf1fb 0%,#cfdbef 70%)}',
      '.clab-note{font-size:0.72rem;line-height:1.6;color:var(--o2tx2);margin-top:8px}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function slider(id,label,min,max,step,val,fmt){
    return '<div class="clab-slider"><div class="v"><span>'+label+'</span><b id="'+id+'-v">'+fmt(val)+'</b></div>'
      +'<input type="range" id="'+id+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'"></div>';
  }

  function render(){
    host.innerHTML=
      '<div class="clab-wrap">'
      +'<div class="clab-card"><div class="clab-row"><div style="flex:1;min-width:0"><div class="clab-t">启用这套聊天外观</div><div class="clab-d">接管聊天气泡：磨砂玻璃、圆角、间距、时间节奏。关掉即回原样。</div></div><div class="clab-sw'+(S.on?' on':'')+'" id="clab-on"></div></div></div>'

      +'<div class="clab-card"><div class="clab-t">预设</div><div class="clab-d">一键换一套基调，再往下面细调。</div>'
      +'<div class="clab-chips" id="clab-presets">'
      +['night:夜间磨砂','ink:墨色清透','day:明亮磨砂','plain:朴素']
          .map(function(x){var k=x.split(':')[0];return '<button type="button" class="clab-chip'+(S.preset===k?' on':'')+'" data-p="'+k+'">'+x.split(':')[1]+'</button>'}).join('')
      +'</div>'
      +'<div class="clab-pv'+(S.preset==='day'?' light':'')+'" id="clab-pv"></div>'
      +'<div class="clab-note">上面是实时预览，下面的滑杆一动它就跟着变。</div></div>'

      +'<div class="clab-card"><div class="clab-t">松紧</div><div class="clab-d">气泡内外边距与行距的整体手感。</div>'
      +'<div class="clab-chips" id="clab-tight">'
      +'<button type="button" class="clab-chip" data-t="t1">紧凑</button>'
      +'<button type="button" class="clab-chip" data-t="t2">标准</button>'
      +'<button type="button" class="clab-chip" data-t="t3">宽松</button>'
      +'</div>'
      +slider('clab-gap','消息间距',2,20,1,S.gap,function(v){return v+'px'})
      +slider('clab-padx','左右内距',10,24,1,S.padX,function(v){return v+'px'})
      +slider('clab-pady','上下内距',7,18,1,S.padY,function(v){return v+'px'})
      +slider('clab-round','圆角',4,30,1,S.round,function(v){return v+'px'})
      +slider('clab-lh','行距',1.4,1.9,0.02,S.lh,function(v){return v})
      +'</div>'

      +'<div class="clab-card"><div class="clab-t">玻璃实验室</div><div class="clab-d">磨砂的质感都在这儿。</div>'
      +slider('clab-blur','模糊',0,40,1,S.blur,function(v){return v+'px'})
      +slider('clab-sat','饱和度',1,2,0.05,S.sat,function(v){return v})
      +slider('clab-bri','亮度',0.7,1.4,0.05,S.bri,function(v){return v})
      +slider('clab-bga','底色不透明度',0,0.24,0.005,S.bgA,function(v){return Number(v).toFixed(3)})
      +slider('clab-linea','描边浓淡',0,0.4,0.01,S.lineA,function(v){return Number(v).toFixed(2)})
      +'</div>'

      +'<div class="clab-card"><div class="clab-t">文字与尺寸</div>'
      +slider('clab-fs','字号',0.8,1.12,0.01,S.fs,function(v){return Number(v).toFixed(2)+'rem'})
      +slider('clab-maxw','气泡最大宽度',70,95,1,S.maxw,function(v){return v+'%'})
      +'</div>'

      +'<div class="clab-card"><div class="clab-t">时间标签</div><div class="clab-d">只在间隔超过设定分钟、或换人说话时才出现一次，不是每条都挂。</div>'
      +'<div class="clab-row" style="margin-top:10px"><div style="flex:1"><div class="clab-t" style="font-size:0.84rem">显示时间</div><div class="clab-d">关掉就整页不显示时间。</div></div><div class="clab-sw'+(S.timeOn?' on':'')+'" id="clab-timeon"></div></div>'
      +slider('clab-timegap','出现间隔',1,60,1,S.timeGap,function(v){return v+' 分钟'})
      +'</div>'

      +'<div class="clab-card"><div class="clab-t">细节</div>'
      +'<div class="clab-row" style="margin-top:10px"><div style="flex:1"><div class="clab-t" style="font-size:0.84rem">气泡角上的小圆点</div><div class="clab-d">你图里那个装饰圈。</div></div><div class="clab-sw'+(S.dot?' on':'')+'" id="clab-dot"></div></div>'
      +slider('clab-dotsize','小圆点大小',3,12,1,S.dotSize,function(v){return v+'px'})
      +'<div class="clab-row" style="margin-top:14px"><div style="flex:1"><div class="clab-t" style="font-size:0.84rem">显示头像</div><div class="clab-d">左侧小圆头像。</div></div><div class="clab-sw'+(S.ava?' on':'')+'" id="clab-ava"></div></div>'
      +'<div class="clab-row" style="margin-top:14px"><div style="flex:1"><div class="clab-t" style="font-size:0.84rem">显示群聊名字</div><div class="clab-d">1对1 本来就不显示。</div></div><div class="clab-sw'+(S.name?' on':'')+'" id="clab-name"></div></div>'
      +'</div>'

      +'<div class="clab-card"><div class="clab-row"><div style="flex:1"><div class="clab-t">恢复默认</div><div class="clab-d">回到夜间磨砂的标准值。</div></div><button type="button" class="clab-chip" id="clab-reset" style="flex:none;min-width:80px">恢复</button></div></div>'
      +'</div>';

    q('#clab-on').addEventListener('click',function(){S.on=!S.on;this.classList.toggle('on',S.on);save();paint()});
    Array.prototype.forEach.call(host.querySelectorAll('#clab-presets .clab-chip'),function(b){
      b.addEventListener('click',function(){applyPreset(b.getAttribute('data-p'));render()});
    });
    q('[data-t="t1"]').addEventListener('click',function(){S.gap=8;S.padX=15;S.padY=10;S.lh=1.65;save();paint();render()});
    q('[data-t="t2"]').addEventListener('click',function(){S.gap=14;S.padX=19;S.padY=13;S.lh=1.78;save();paint();render()});
    q('[data-t="t3"]').addEventListener('click',function(){S.gap=20;S.padX=22;S.padY=16;S.lh=1.86;save();paint();render()});
    q('#clab-timeon').addEventListener('click',function(){S.timeOn=!S.timeOn;this.classList.toggle('on',S.timeOn);save();paint()});
    q('#clab-dot').addEventListener('click',function(){S.dot=!S.dot;this.classList.toggle('on',S.dot);save();paint()});
    q('#clab-ava').addEventListener('click',function(){S.ava=!S.ava;this.classList.toggle('on',S.ava);save();paint()});
    q('#clab-name').addEventListener('click',function(){S.name=!S.name;this.classList.toggle('on',S.name);save();paint()});
    q('#clab-reset').addEventListener('click',function(){applyPreset('night');toast('已恢复默认');render()});

    [['clab-gap','gap',function(v){return v+'px'}],
     ['clab-padx','padX',function(v){return v+'px'}],
     ['clab-pady','padY',function(v){return v+'px'}],
     ['clab-round','round',function(v){return v+'px'}],
     ['clab-lh','lh',function(v){return v}],
     ['clab-blur','blur',function(v){return v+'px'}],
     ['clab-sat','sat',function(v){return v}],
     ['clab-bri','bri',function(v){return v}],
     ['clab-bga','bgA',function(v){return Number(v).toFixed(3)}],
     ['clab-fs','fs',function(v){return Number(v).toFixed(2)+'rem'}],
     ['clab-maxw','maxw',function(v){return v+'%'}],
     ['clab-linea','lineA',function(v){return Number(v).toFixed(2)}],
     ['clab-dotsize','dotSize',function(v){return v+'px'}],
     ['clab-timegap','timeGap',function(v){return v+' 分钟'}]
    ].forEach(function(x){
      var el=q('#'+x[0]);if(!el)return;
      el.addEventListener('input',function(){
        S[x[1]]=Number(el.value);
        var lab=q('#'+x[0]+'-v');if(lab)lab.textContent=x[2](Number(el.value));
        save();paint();
      });
    });

    paintPreview();
  }

  /* ═══════════════ 启动 ═══════════════ */
  (async function boot(){
    for(var i=0;i<60;i++){
      var ok=false;
      try{ok=!!(db&&db.objectStoreNames&&db.objectStoreNames.contains('apiSettings'))}catch(e){ok=false}
      if(ok)break;
      await new Promise(function(r){setTimeout(r,100)});
    }
    await load();
    install();
    paint();
    runCollapse();
    setTimeout(runCollapse,600);
    setTimeout(runCollapse,2000);
  })();

  IBApps.register({
    id:'chatlab',name:'聊天外观',version:'1.2.0',sdk:2,wall:true,
    icon:'<path d="M4 12a8 8 0 1 1 3.2 6.4L4 20l1.3-3.4A7.9 7.9 0 0 1 4 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
    mount:async function(h,c){
      host=h;ctx=c;css();host.style.padding='0';
      await load();if(!host)return;render();paint();
    },
    back:function(){return false},
    unmount:function(){host=null;ctx=null;var old=document.getElementById('clab-ui');if(old)old.remove()}
  });
})();
