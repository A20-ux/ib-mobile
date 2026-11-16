window.IB_APP_REGEX = {
  id: "regex",
  name: "正则工具",
  desc: "正则表达式测试 | 匹配、高亮、替换、捕获组查看",
  render: function (container) {
    container.innerHTML = `
    <style>
      .ib-regex-wrap{padding:16px;box-sizing:border-box;height:100%;overflow:auto}
      textarea{width:100%;padding:10px;margin:8px 0;border-radius:8px;border:1px solid #ccc;font-size:14px}
      input{width:calc(100% - 22px);padding:10px;margin:8px 0;border-radius:8px;border:1px solid #ccc}
      .btn{padding:8px 14px;border-radius:6px;background:#4466ff;color:#fff;border:none;margin:4px}
      .res{background:#f4f6ff;padding:12px;border-radius:8px;margin-top:10px;white-space:pre-wrap;font-family:monospace}
      .match{background:#ffdd77}
    </style>
    <div class="ib-regex-wrap">
      <h3>🔍 正则测试工具</h3>
      <label>正则表达式</label>
      <input id="pat" placeholder="例：\\d+" value="">
      <label>标志 g i m</label>
      <input id="flag" placeholder="g" value="g">
      <label>待测试文本</label>
      <textarea id="src" rows="6" placeholder="粘贴需要匹配的文本"></textarea>
      <button class="btn" id="run">运行匹配</button>
      <button class="btn" id="replBtn">替换</button>
      <input id="replText" placeholder="替换为..." value="">
      <div class="res" id="out"></div>
    </div>
    `;

    const patEl = container.querySelector("#pat");
    const flagEl = container.querySelector("#flag");
    const srcEl = container.querySelector("#src");
    const outEl = container.querySelector("#out");
    const replEl = container.querySelector("#replText");

    container.querySelector("#run").onclick = () => {
      try {
        const reg = new RegExp(patEl.value, flagEl.value);
        const text = srcEl.value;
        const matches = [...text.matchAll(reg)];
        let highlighted = text.replace(reg, m=>`<span class="match">${m}</span>`);
        outEl.innerHTML = `✅ 匹配数量：${matches.length}\n`
        + JSON.stringify(matches.map(x=>({match:x[0],groups:x.groups||""})),null,2)
        + "\n\n高亮预览：\n"+highlighted;
      }catch(e){
        outEl.textContent = `❌ 正则语法错误：${e.message}`;
      }
    }

    container.querySelector("#replBtn").onclick = () => {
      try {
        const reg = new RegExp(patEl.value, flagEl.value);
        const result = srcEl.value.replace(reg, replEl.value);
        outEl.textContent = `✅ 替换结果：\n${result}`;
      }catch(e){
        outEl.textContent = `❌ 错误：${e.message}`;
      }
    }
  }
}
