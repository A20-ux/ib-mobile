/* IB 桌面 APP · 宿主与设备工具 v1.0.0 —— 图 6/7 那张「按需开关」的权限面板。
   16 项能力逐条开关，默认全开里挑一半关；状态落在 apiSettings（app_toolgate_cfg），
   并对外暴露 window.IBToolGate，别的模块/以后的工具调用可以先查这一份再动手。
   面板本身不改任何行为的实现，只负责「授权」这一层。 */
(function(){
  if(!window.IBApps)return;
  var host=null,ctx=null;
  var KEY='app_toolgate_cfg';

  /* id / 标题 / 说明 / 默认 / 网页端能不能真的做 */
  var ITEMS=[
    ['desk','读桌面（列出 App）','让 TA 看得到你桌面上有哪些 App、哪些有数据。',1,'web'],
    ['openapp','打开 App','让 TA 真的在屏幕上点开某个 App（看得见光晕落在图标上）。',1,'web'],
    ['readapp','读 App 内容','让 TA 读某个 App 里的真实内容摘要；微信/信息里可点名读对话。',1,'partial'],
    ['toast','弹屏内提示','让 TA 在你屏幕上弹一条提示。只是屏内提醒，不会推到系统通知栏。',1,'web'],
    ['writedoc','写文件进文件库','写一份产物进「文件」App（与工作台文件库同一份存储）。',1,'web'],
    ['listdoc','看文件库全部产物','看「文件」App 里全部产物（跨会话）。',0,'web'],
    ['net','发网络请求','让 TA 发一个通用网络请求；跨域被拦时自动走你自己部署的网关。',0,'partial'],
    ['xhs','读小红书笔记','让 TA 读一条小红书笔记：标题、正文、配图、作者、点赞收藏数。',1,'partial'],
    ['screen','截真机屏幕','让 TA 截一张真机屏幕并存进相册。',1,'web'],
    ['bridge','现实桥指令','让 TA 发现实桥指令（截屏 / 剪贴板 / 设备信息 / 打开链接）。',1,'partial'],
    ['device','查你的手机状态','让 TA 查你的手机：几点了、电量多少、你在家还是外面、刚刚在刷什么。',1,'partial'],
    ['usage','看你各 App 用了多久','让 TA 查最近一段时间你各用了哪些 App、各多久。',1,'partial'],
    ['launch','帮你打开真机 App','让 TA 真的帮你打开某个手机 App。',1,'partial'],
    ['block','不让你进某个 App','让 TA 不让你进某个 App（这期间一打开就被拽回聊天）。',1,'partial'],
    ['clip','读剪贴板','让 TA 读你复制过的内容（浏览器会单独弹一次授权）。',0,'web'],
    ['page','看你的当前网页','让 TA 读你正在看的这个页面的内容摘要。',0,'web']
    ];
  var S={};

  function q(s){return host?host.querySelector(s):null}
  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function toast(t){try{ctx.ui.toast(t)}catch(e){}}

  function defaults(){var d={};ITEMS.forEach(function(i){d[i[0]]=!!i[3]});return d}

  async function load(){
    S=defaults();
    try{
      var r=await new Promise(function(res,rej){
        var tx=db.transaction('apiSettings','readonly');
        var req=tx.objectStore('apiSettings').get(KEY);
        req.onsuccess=function(){res(req.result)};req.onerror=function(){rej(req.error)};
      });
      if(r&&r.v&&typeof r.v==='object')Object.keys(r.v).forEach(function(k){if(k in S)S[k]=!!r.v[k]});
    }catch(e){}
    publish();
  }
  async function save(){
    try{await dbPut('apiSettings',{id:KEY,app:'toolgate',key:'cfg',v:S,updated:Date.now()})}catch(e){}
    publish();
  }
  function publish(){try{window.IBToolGate={get:function(id){return !!S[id]},all:function(){return Object.assign({},S)},on:function(){return Object.keys(S).filter(function(k){return S[k]}).length},total:function(){return ITEMS.length}}}catch(e){}}
  function countOn(){return Object.keys(S).filter(function(k){return S[k]}).length}

  function css(){
    var old=document.getElementById('tg-css');if(old)old.remove();
    var s=document.createElement('style');s.id='tg-css';
    s.textContent=[
      '#tg-wrap{padding:16px 14px 28px;box-sizing:border-box}',
      '#tg-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}',
      '#tg-title{font-size:1.06rem;font-weight:700;line-height:1.4;color:#12161d}',
      '#tg-count{flex:none;font-size:0.78rem;color:#7a8290;text-align:right;line-height:1.5}',
      '#tg-count b{display:block;font-size:0.98rem;color:#12161d}',
      '#tg-intro{font-size:0.82rem;line-height:1.72;color:#5b636f;margin:0 0 14px}',
      '.tg-item{display:flex;align-items:center;gap:14px;padding:14px 16px;margin-bottom:10px;border-radius:16px;background:#fff;border:1px solid rgba(0,0,0,.06);box-shadow:0 1px 2px rgba(16,24,40,.04)}',
      '.tg-m{flex:1;min-width:0}',
      '.tg-n{font-size:0.94rem;font-weight:600;color:#171c24;display:flex;align-items:center;gap:8px}',
      '.tg-tag{font-size:0.62rem;font-weight:500;padding:1px 6px;border-radius:999px;border:1px solid rgba(0,0,0,.1);color:#8892a0}',
      '.tg-tag.web{color:#2f6fb5;border-color:rgba(60,130,200,.35);background:rgba(60,130,200,.08)}',
      '.tg-d{margin-top:4px;font-size:0.76rem;line-height:1.62;color:#78808d}',
      '.tg-sw{flex:none;width:54px;height:32px;border-radius:18px;background:#d9dde4;position:relative;cursor:pointer;transition:background .16s}',
      '.tg-sw::after{content:"";position:absolute;top:3px;left:3px;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.24);transition:left .16s}',
      '.tg-sw.on{background:#171c24}.tg-sw.on::after{left:25px}',
      '#tg-foot{margin-top:14px;display:flex;gap:10px}',
      '.tg-btn{flex:1;padding:12px 0;border-radius:14px;border:1px solid rgba(0,0,0,.1);background:#fff;color:#3a424e;font-size:0.84rem;cursor:pointer}',
      '.tg-btn.pri{background:#171c24;color:#fff;border-color:#171c24}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function render(){
    var on=countOn();
    host.innerHTML='<div id="tg-wrap">'
      +'<div id="tg-head"><div id="tg-title">宿主与设备工具<br>（按需开关）</div>'
      +'<div id="tg-count"><b>'+on+' / '+ITEMS.length+'</b>已开启</div></div>'
      +'<div id="tg-intro">打开后模型才能读你的桌面、打开 App、发屏内提示、发网络请求或调设备。默认全部关闭，所以要开哪项由你说了算。</div>'
      +ITEMS.map(function(it){
        var can=it[4]==='web'?'<span class="tg-tag web">网页可做</span>':(it[4]==='partial'?'<span class="tg-tag">需真机/网关</span>':'');
        return '<div class="tg-item" data-k="'+it[0]+'">'
          +'<div class="tg-m"><div class="tg-n">'+esc(it[1])+can+'</div><div class="tg-d">'+esc(it[2])+'</div></div>'
          +'<div class="tg-sw'+(S[it[0]]?' on':'')+'"></div>'
        +'</div>';
      }).join('')
      +'<div id="tg-foot"><button type="button" class="tg-btn" id="tg-all">全部关闭</button><button type="button" class="tg-btn pri" id="tg-def">恢复默认</button></div>'
      +'</div>';

    Array.prototype.forEach.call(host.querySelectorAll('.tg-item'),function(row){
      var sw=row.querySelector('.tg-sw'), k=row.getAttribute('data-k');
      sw.addEventListener('click',function(){
        S[k]=!S[k];sw.classList.toggle('on',S[k]);
        var c=q('#tg-count b');if(c)c.textContent=countOn()+' / '+ITEMS.length;
        save();
      });
    });
    q('#tg-all').addEventListener('click',function(){Object.keys(S).forEach(function(k){S[k]=false});save();render();toast('全部关闭')});
    q('#tg-def').addEventListener('click',function(){S=defaults();save();render();toast('已恢复默认')});
  }

  IBApps.register({
    id:'toolgate',name:'工具权限',version:'1.0.0',sdk:2,
    icon:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12h8M12 8v8"/>',
    mount:async function(h,c){
      host=h;ctx=c;css();
      try{
        for(var i=0;i<40;i++){
          if(db&&db.objectStoreNames&&db.objectStoreNames.contains('apiSettings'))break;
          await new Promise(function(r){setTimeout(r,100)});
        }
      }catch(e){}
      await load();if(!host)return;render();
    },
    back:function(){return false},
    unmount:function(){host=null;ctx=null;var o=document.getElementById('tg-css');if(o)o.remove()}
  });
})();
