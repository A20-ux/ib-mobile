/* IB 桌面 APP · 世界书 v1.1.0 —— 通用设定词条库 + 多气泡对白演练。
   词条字段：类型 / 标题 / 触发关键词 / 标签 / 设定正文；可按类型与关键词筛选，整份导出 / 导入 JSON，可整份复制成提示词。
   对话：每一句话＝一个独立气泡（不再一个气泡堆好几行），可逐条增删、批量导入。
   只经 ctx.storage 落库（app_worldbook_*），随底座备份导出；不碰主对话、不改 index.html。 */
(function(){
  if(!window.IBApps)return;
  var host=null,ctx=null;
  var entries=[],dialog=[],tab='entries';
  var filterType='全部',filterKw='';
  var TYPES=['人物','地点','势力','物品','规则','时间线','其他'];
  var PAL=['#5b7cfa','#e07a9b','#3fa68a','#c98a3a','#8a76d6','#3f96b8','#b5656f','#6f9e4d'];

  function esc(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function q(sel){return host?host.querySelector(sel):null}
  function toast(t){try{ctx.ui.toast(t)}catch(e){}}
  function uid(){return 'w_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)}
  function speakerColor(name){var h=0,s=String(name||'?');for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return PAL[Math.abs(h)%PAL.length]}
  function splitWords(s){return String(s||'').split(/[,，、;；\s]+/).filter(Boolean)}

  async function load(){
    try{var e=await ctx.storage.get('entries');if(Array.isArray(e))entries=e.map(normalizeEntry)}catch(e){}
    try{var d=await ctx.storage.get('dialog');if(Array.isArray(d))dialog=d}catch(e){}
  }
  function normalizeEntry(en){
    return {
      id:en.id||uid(),
      type:TYPES.indexOf(en.type)>=0?en.type:'其他',
      title:String(en.title||'未命名'),
      keys:String(en.keys||''),
      tags:String(en.tags||''),
      body:String(en.body||''),
      created:en.created||Date.now()
    };
  }
  async function saveEntries(){try{await ctx.storage.set('entries',entries)}catch(e){}}
  async function saveDialog(){try{await ctx.storage.set('dialog',dialog)}catch(e){}}

  /* ── 词条面板 ── */
  function filteredEntries(){
    var kw=filterKw.trim().toLowerCase();
    return entries.filter(function(en){
      if(filterType!=='全部'&&en.type!==filterType)return false;
      if(!kw)return true;
      var hay=(en.title+' '+en.keys+' '+en.tags+' '+en.body).toLowerCase();
      return hay.indexOf(kw)>=0;
    });
  }

  function paintEntries(){
    var box=q('.wb-entry-list');if(!box)return;
    var list=filteredEntries();
    if(!entries.length){box.innerHTML='<div class="wb-empty">还没有词条。先在上面写一条人物 / 地点 / 势力 / 规则设定吧。</div>';return}
    if(!list.length){box.innerHTML='<div class="wb-empty">当前筛选下没有词条。</div>';return}
    var html='';
    list.forEach(function(en){
      var idx=entries.indexOf(en);
      var tags=splitWords(en.tags).map(function(t){return '<span class="wb-tag">'+esc(t)+'</span>'}).join('');
      var keys=splitWords(en.keys).map(function(k){return '<span class="wb-key">'+esc(k)+'</span>'}).join('');
      html+='<div class="wb-card">'
        +'<div class="wb-card-h"><span class="wb-type">'+esc(en.type)+'</span><b>'+esc(en.title)+'</b><button type="button" class="wb-del" data-i="'+idx+'" aria-label="删除">✕</button></div>'
        +(keys?'<div class="wb-keys">🔑 '+keys+'</div>':'')
        +(tags?'<div class="wb-tags">'+tags+'</div>':'')
        +'<div class="wb-body">'+esc(en.body||'')+'</div>'
        +'</div>';
    });
    box.innerHTML=html;
    Array.prototype.forEach.call(box.querySelectorAll('.wb-del'),function(b){
      b.addEventListener('click',function(){
        var i=parseInt(b.getAttribute('data-i'));if(isNaN(i))return;
        if(!confirm('删除词条「'+(entries[i].title||'未命名')+'」？'))return;
        entries.splice(i,1);saveEntries();paintEntries();
      });
    });
  }

  function entryText(){
    return entries.map(function(en){
      var t='【'+(en.type||'其他')+' · '+(en.title||'未命名')+'】';
      var ks=splitWords(en.keys);if(ks.length)t+='\n触发词：'+ks.join('、');
      if(en.tags)t+='\n标签：'+String(en.tags).trim();
      return t+'\n'+String(en.body||'').trim();
    }).join('\n\n');
  }

  /* ── 对话面板：每条台词一个独立气泡 ── */
  function paintDialog(){
    var box=q('.wb-bubbles');if(!box)return;
    if(!dialog.length){box.innerHTML='<div class="wb-empty">还没有对白。在下面选好说话人、写一句话，点「加一条」；也可以整段粘进来自动拆成多个气泡。</div>';return}
    var html='';
    dialog.forEach(function(d,i){
      var col=speakerColor(d.who);
      html+='<div class="wb-bub">'
        +'<div class="wb-who" style="color:'+col+'">'+esc(d.who||'匿名')+'</div>'
        +'<div class="wb-bubble" style="border-left-color:'+col+'">'+esc(d.text||'')+'</div>'
        +'<button type="button" class="wb-bub-del" data-i="'+i+'" aria-label="删除气泡">✕</button>'
        +'</div>';
    });
    box.innerHTML=html;
    box.scrollTop=box.scrollHeight;
    Array.prototype.forEach.call(box.querySelectorAll('.wb-bub-del'),function(b){
      b.addEventListener('click',function(){
        var i=parseInt(b.getAttribute('data-i'));if(isNaN(i))return;
        dialog.splice(i,1);saveDialog();paintDialog();
      });
    });
  }

  function addTurn(who,text){
    who=String(who||'匿名').trim().slice(0,16);
    text=String(text||'').trim();
    if(!text){toast('先写一句台词');return false}
    dialog.push({id:uid(),who:who||'匿名',text:text});
    saveDialog();paintDialog();return true;
  }

  function bulkImport(raw,fallbackWho){
    var lines=String(raw||'').split(/\r?\n/);
    var n=0;
    lines.forEach(function(line){
      line=line.trim();if(!line)return;
      var m=line.match(/^([^:：]{1,16})[:：]\s*(.+)$/);
      var who=m?m[1].trim():String(fallbackWho||'匿名').trim();
      var text=m?m[2].trim():line;
      if(text){dialog.push({id:uid(),who:who||'匿名',text:text});n++}
    });
    if(n){saveDialog();paintDialog();toast('已拆成 '+n+' 个气泡')}else{toast('没有可导入的内容')}
  }

  /* ── 导入 / 导出 JSON ── */
  function exportJSON(){
    var data={app:'worldbook',version:1,exported:Date.now(),entries:entries,dialog:dialog};
    var txt=JSON.stringify(data,null,2);
    copyText(txt);
    toast('已复制世界书 JSON');
  }
  function importJSON(raw){
    var data;
    try{data=JSON.parse(String(raw||''))}catch(e){toast('JSON 解析失败');return}
    var list=Array.isArray(data)?data:data.entries;
    if(!Array.isArray(list)){toast('没找到词条数组');return}
    var cleaned=list.map(normalizeEntry);
    if(data.dialog&&Array.isArray(data.dialog))dialog=data.dialog;
    if(confirm('导入 '+cleaned.length+' 条词条？\n「取消」＝覆盖现有；「确定」＝追加合并。')){
      entries=entries.concat(cleaned);
    }else{
      entries=cleaned;
    }
    saveEntries();saveDialog();paintEntries();paintDialog();
    toast('已导入 '+cleaned.length+' 条词条');
  }

  function css(){
    var old=document.getElementById('wb-css');if(old)old.remove();
    var st=document.createElement('style');st.id='wb-css';
    st.textContent=[
      '.wb-wrap{display:flex;flex-direction:column;height:100%;gap:10px}',
      '.wb-tabs{display:flex;gap:8px}',
      '.wb-tab{flex:1;padding:9px 0;border-radius:11px;border:1px solid var(--o2line);background:var(--o2in);color:var(--o2tx);font-size:0.84rem;cursor:pointer}',
      '.wb-tab.on{background:var(--o2acc);border-color:var(--o2acc);color:#fff;font-weight:700}',
      '.wb-pane{display:none;flex-direction:column;gap:10px;min-height:0}',
      '.wb-pane.on{display:flex}',
      '.wb-card{padding:11px 12px;border-radius:14px;background:var(--o2card);border:1px solid var(--o2line)}',
      '.wb-field{margin-bottom:8px}',
      '.wb-field label{display:block;font-size:0.72rem;color:var(--o2tx2);margin-bottom:4px}',
      '.wb-field input,.wb-field textarea,.wb-field select{width:100%;box-sizing:border-box;padding:9px 10px;border-radius:10px;border:1px solid var(--o2line);background:var(--o2in);color:var(--o2tx);font-size:0.84rem;font-family:inherit}',
      '.wb-field textarea{resize:vertical;min-height:74px;line-height:1.5}',
      '.wb-row{display:flex;gap:8px}',
      '.wb-row .wb-field{flex:1}',
      '.wb-btn{padding:10px 0;border-radius:11px;border:1px solid var(--o2line);background:var(--o2in);color:var(--o2tx);font-size:0.82rem;cursor:pointer}',
      '.wb-btn.pri{background:var(--o2acc);border-color:var(--o2acc);color:#fff;font-weight:700}',
      '.wb-actions{display:flex;gap:8px;flex-wrap:wrap}',
      '.wb-actions .wb-btn{flex:1;min-width:96px}',
      '.wb-filter{display:flex;gap:8px;align-items:center}',
      '.wb-filter .wb-field{flex:1;margin-bottom:0}',
      '.wb-filter .wb-field.wb-fw{flex:2}',
      '.wb-entry-list{display:flex;flex-direction:column;gap:10px;overflow:auto;min-height:80px}',
      '.wb-card-h{display:flex;align-items:center;justify-content:space-between;gap:8px}',
      '.wb-card-h b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.wb-type{flex:none;font-size:0.66rem;font-weight:700;padding:2px 9px;border-radius:8px;background:var(--o2in);color:var(--o2acc)}',
      '.wb-del{flex:none;border:none;background:none;color:var(--o2tx2);font-size:0.8rem;cursor:pointer;padding:2px 6px}',
      '.wb-tags{margin:6px 0;display:flex;flex-wrap:wrap;gap:6px}',
      '.wb-tag{font-size:0.68rem;padding:2px 8px;border-radius:8px;background:var(--o2in);color:var(--o2tx2)}',
      '.wb-keys{margin:6px 0;display:flex;flex-wrap:wrap;gap:6px}',
      '.wb-key{font-size:0.68rem;padding:2px 8px;border-radius:8px;border:1px dashed var(--o2line);color:var(--o2tx2)}',
      '.wb-body{white-space:pre-wrap;line-height:1.6;font-size:0.84rem;color:var(--o2tx)}',
      '.wb-empty{padding:26px 12px;text-align:center;font-size:0.8rem;color:var(--o2tx2)}',
      '.wb-bubbles{display:flex;flex-direction:column;gap:12px;min-height:120px;max-height:46vh;overflow:auto;padding:4px 2px}',
      '.wb-bub{position:relative;display:flex;flex-direction:column;gap:4px;max-width:86%}',
      '.wb-bub .wb-bub-del{position:absolute;right:-2px;top:-4px;border:none;background:none;color:var(--o2tx2);font-size:0.7rem;cursor:pointer;padding:2px 6px;opacity:0}',
      '.wb-bub:active .wb-bub-del,.wb-bub:hover .wb-bub-del{opacity:1}',
      '.wb-who{font-size:0.72rem;font-weight:700;padding-left:12px}',
      '.wb-bubble{padding:9px 12px;border-radius:4px 14px 14px 14px;background:var(--o2card);border:1px solid var(--o2line);border-left:3px solid #999;white-space:pre-wrap;line-height:1.55;font-size:0.86rem;color:var(--o2tx)}',
      '.wb-import{margin-top:4px}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function typeOptions(sel){
    return ['全部'].concat(TYPES).map(function(t){
      return '<option value="'+esc(t)+'"'+(t===sel?' selected':'')+'>'+esc(t)+'</option>';
    }).join('');
  }

  function render(){
    var typeOpts=typeOptions('全部');
    var formTypeOpts=typeOptions('人物');
    host.innerHTML=
      '<div class="wb-wrap">'
      +'<div class="wb-tabs"><button type="button" class="wb-tab" data-tab="entries">词条</button><button type="button" class="wb-tab" data-tab="dialog">对话 · 多气泡</button></div>'
      +'<div class="wb-pane" data-pane="entries">'
      +'  <div class="wb-filter">'
      +'    <div class="wb-field"><label>类型筛选</label><select id="wb-f-type">'+typeOpts+'</select></div>'
      +'    <div class="wb-field wb-fw"><label>关键词搜索（标题 / 触发词 / 标签 / 正文）</label><input id="wb-f-kw" placeholder="输入后即时过滤"></div>'
      +'  </div>'
      +'  <div class="wb-card">'
      +'    <div class="wb-row">'
      +'      <div class="wb-field"><label>类型</label><select id="wb-e-type">'+formTypeOpts+'</select></div>'
      +'      <div class="wb-field" style="flex:2"><label>标题</label><input id="wb-e-title" placeholder="人物 / 地点 / 势力 / 规则…"></div>'
      +'    </div>'
      +'    <div class="wb-field"><label>触发关键词（逗号分隔，命中即带出此条）</label><input id="wb-e-keys" placeholder="如：江璟熙, 师兄, 御兽宗"></div>'
      +'    <div class="wb-field"><label>标签（逗号分隔）</label><input id="wb-e-tags" placeholder="如：主角, 学院, 中立"></div>'
      +'    <div class="wb-field"><label>设定正文</label><textarea id="wb-e-body" placeholder="把这条设定写清楚…"></textarea></div>'
      +'    <div class="wb-actions"><button type="button" class="wb-btn pri" id="wb-e-save">保存词条</button><button type="button" class="wb-btn" id="wb-e-copy">复制全部词条</button></div>'
      +'    <div class="wb-actions"><button type="button" class="wb-btn" id="wb-e-export">导出 JSON</button><button type="button" class="wb-btn" id="wb-e-import">导入 JSON</button></div>'
      +'  </div>'
      +'  <div class="wb-entry-list"></div>'
      +'</div>'
      +'<div class="wb-pane" data-pane="dialog">'
      +'  <div class="wb-bubbles"></div>'
      +'  <div class="wb-card">'
      +'    <div class="wb-row">'
      +'      <div class="wb-field"><label>说话人</label><input id="wb-d-who" placeholder="名字"></div>'
      +'      <div class="wb-field" style="flex:2"><label>一句台词（一条＝一个气泡）</label><input id="wb-d-text" placeholder="写一句话，不要换行"></div>'
      +'    </div>'
      +'    <div class="wb-actions"><button type="button" class="wb-btn pri" id="wb-d-add">加一条气泡</button><button type="button" class="wb-btn" id="wb-d-clear">清空对话</button></div>'
      +'    <div class="wb-field wb-import"><label>批量导入（每行一句；可写「名字：台词」）</label><textarea id="wb-d-bulk" placeholder="例：&#10;阿尔杰：今天风很大。&#10;莉诺：那就别走了。"></textarea></div>'
      +'    <div class="wb-actions"><button type="button" class="wb-btn" id="wb-d-import">拆成多个气泡</button></div>'
      +'  </div>'
      +'</div>'
      +'</div>';

    Array.prototype.forEach.call(host.querySelectorAll('.wb-tab'),function(b){
      b.addEventListener('click',function(){
        tab=b.getAttribute('data-tab');
        Array.prototype.forEach.call(host.querySelectorAll('.wb-tab'),function(x){x.classList.toggle('on',x===b)});
        Array.prototype.forEach.call(host.querySelectorAll('.wb-pane'),function(p){p.classList.toggle('on',p.getAttribute('data-pane')===tab)});
      });
    });
    q('.wb-tab[data-tab="entries"]').classList.add('on');
    q('.wb-pane[data-pane="entries"]').classList.add('on');

    /* 筛选事件 */
    q('#wb-f-type').addEventListener('change',function(){filterType=this.value;paintEntries()});
    q('#wb-f-kw').addEventListener('input',function(){filterKw=this.value;paintEntries()});

    /* 词条事件 */
    q('#wb-e-save').addEventListener('click',function(){
      var type=q('#wb-e-type').value;
      var title=q('#wb-e-title').value.trim();
      var keys=q('#wb-e-keys').value.trim();
      var tags=q('#wb-e-tags').value.trim();
      var body=q('#wb-e-body').value.trim();
      if(!title&&!body){toast('标题或正文至少填一项');return}
      entries.unshift({id:uid(),type:type,title:title||'未命名',keys:keys,tags:tags,body:body,created:Date.now()});
      q('#wb-e-type').value='人物';q('#wb-e-title').value='';q('#wb-e-keys').value='';q('#wb-e-tags').value='';q('#wb-e-body').value='';
      saveEntries();paintEntries();toast('已保存词条');
    });
    q('#wb-e-copy').addEventListener('click',function(){
      var txt=entryText();
      if(!txt){toast('还没有词条');return}
      copyText(txt);
    });
    q('#wb-e-export').addEventListener('click',exportJSON);
    q('#wb-e-import').addEventListener('click',function(){
      var raw=prompt('粘贴世界书 JSON（导出时复制的整份内容）：');
      if(raw)importJSON(raw);
    });

    /* 对话事件 */
    q('#wb-d-add').addEventListener('click',function(){
      var who=q('#wb-d-who').value;var text=q('#wb-d-text').value;
      if(addTurn(who,text)){q('#wb-d-text').value=''}
    });
    q('#wb-d-text').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();q('#wb-d-add').click()}});
    q('#wb-d-clear').addEventListener('click',function(){
      if(!dialog.length)return;
      if(!confirm('清空全部对白气泡？'))return;
      dialog=[];saveDialog();paintDialog();
    });
    q('#wb-d-import').addEventListener('click',function(){
      bulkImport(q('#wb-d-bulk').value,q('#wb-d-who').value);
      q('#wb-d-bulk').value='';
    });

    paintEntries();paintDialog();
  }

  function copyText(txt){
    function done(){toast('已复制到剪贴板')}
    function fallback(){
      var ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);
      ta.select();try{document.execCommand('copy');done()}catch(e){toast('复制失败，请手动长按选择')}ta.remove();
    }
    try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(done,fallback)}else fallback()}catch(e){fallback()}
  }

  IBApps.register({
    id:'worldbook',name:'世界书',version:'1.1.0',sdk:2,wall:true,
    icon:'<path d="M12 6.5C10.5 5 8.3 4.5 6 4.5c-1.7 0-3 .4-3 1.5v12c0 1.1 1.3 1.5 3 1.5 2.3 0 4.5.5 6 2 1.5-1.5 3.7-2 6-2 1.7 0 3-.4 3-1.5v-12c0-1.1-1.3-1.5-3-1.5-2.3 0-4.5.5-6 2z"/><path d="M12 6.5v13"/>',
    mount:async function(h,c){
      host=h;ctx=c;css();host.style.padding='0';host.style.overflow='hidden';
      await load();if(!host)return;render();
    },
    back:function(){return false},
    unmount:function(){
      entries=[];dialog=[];host=null;ctx=null;
      var old=document.getElementById('wb-css');if(old)old.remove();
    }
  });
})();
