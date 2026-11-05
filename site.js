// 预计算检索页：只读 dist/data/retrieve.json，不发任何网络请求、不含任何模型调用路径。
(function () {
  var DATA = null;

  function el(id) { return document.getElementById(id); }

  function opt(select, value, text) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    select.appendChild(o);
  }

  function fmt(v) { return (v === null || v === undefined) ? '—' : String(v); }

  function topTable(q, rowKey) {
    var d = q.rows[rowKey];
    if (!d) return '<p class="badge">这一行没有该题的明细</p>';
    var head = '<tr><th>名次</th><th>分数</th><th>片段代号</th><th>是不是 gold</th></tr>';
    var items = (d.top || []).map(function (t) {
      var flag = t.is_gold ? '<span class="hit">是 gold</span>' : '<span class="badge">否</span>';
      return '<tr><td class="num">' + t.rank + '</td><td class="num">' + t.score.toFixed(4)
        + '</td><td class="snippet">#' + t.snippet + '</td><td>' + flag + '</td></tr>';
    }).join('');
    var extra;
    if (q.group === 'positive') {
      extra = '<p>gold 名次：<strong>' + fmt(d.gold_rank) + '</strong>（gold 分数 ' + fmt(d.gold_score)
        + '）｜进前 5：' + (d.hit_at_k ? '<span class="hit">是</span>' : '<span class="miss">否</span>')
        + '｜管线拒答（没放行证据）：' + (d.refused ? '<span class="miss">是</span>' : '否')
        + '｜答案说了「资料中没有」：' + (d.says_absence ? '<span class="miss">是（这就是过度拒答的逐题布尔）</span>' : '否')
        + '｜gold 已放行：' + (d.gold_released ? '是' : '否')
        + '｜放行 ' + d.released_count + ' 条｜出处 ' + d.citations_count + ' 条'
        + '｜出处命中 gold：' + (d.cite_hit ? '<span class="hit">是</span>' : '<span class="badge">否</span>') + '</p>';
    } else {
      extra = '<p>过阈值：' + (d.passes_threshold ? '<span class="hit">是</span>' : '<span class="miss">否</span>')
        + '｜top1 分数：' + fmt(d.top1_score) + '｜放行 ' + d.released_count + ' 条｜拒答：'
        + (d.refused ? '是' : '否') + '｜类别：<strong>' + fmt(d['class']) + '</strong>（A＝没放行证据，B＝放行了但不覆盖）'
        + '｜出处 ' + d.citations_count + ' 条</p>';
    }
    return extra + '<table><thead>' + head + '</thead><tbody>' + items + '</tbody></table>';
  }

  function compareTable(q) {
    var head = '<tr><th>实验行</th><th>口径版本</th><th>结论</th><th>gold 名次</th><th>进前 5</th>'
      + '<th>管线拒答</th><th>说了「资料中没有」</th><th>放行条数</th><th>出处条数</th><th>过阈值／类别</th></tr>';
    var body = DATA.rows.map(function (r) {
      var d = q.rows[r.key];
      if (!d) return '<tr><td>' + r.label + '</td><td colspan="9" class="badge">该行无此题明细</td></tr>';
      var rank = q.group === 'positive' ? fmt(d.gold_rank) : '—';
      var hit = q.group === 'positive'
        ? (d.hit_at_k ? '<span class="hit">是</span>' : '<span class="miss">否</span>') : '—';
      var abs = q.group === 'positive'
        ? (d.says_absence ? '<span class="miss">是</span>' : '否') : '—';
      var last = q.group === 'positive' ? '—' : (fmt(d.passes_threshold) + '／' + fmt(d['class']));
      return '<tr><td>' + r.label + '</td><td>' + r.caliber + '</td><td>' + r.verdict + '</td>'
        + '<td class="num">' + rank + '</td><td>' + hit + '</td><td>' + (d.refused ? '是' : '否') + '</td>'
        + '<td>' + abs + '</td><td class="num">' + d.released_count + '</td>'
        + '<td class="num">' + d.citations_count + '</td><td>' + last + '</td></tr>';
    }).join('');
    return '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  function l2Panel(q) {
    var fields = [["题面", q.l2 ? q.l2.question : null],
                  ["gold 文件名", q.l2 ? q.l2.gold_doc : null],
                  ["top1 片段前 80 字", q.l2 ? q.l2.excerpt : null]];
    var rows = fields.map(function (f) {
      var value = f[1];
      var cell = (value === null || value === undefined)
        ? '<span class="refused">该字段不在公开范围（需逐字段批准，见 pub/approvals.json）</span>'
        : esc(value);
      return '<tr><td>' + f[0] + '</td><td>' + cell + '</td></tr>';
    }).join('');
    var conflicts = (DATA.meta.pending_conflicts || []).map(function (c) {
      return '<li>' + esc(c) + '</li>';
    }).join('');
    var head = '<p class="lead">批准单位是<strong>字段</strong>不是题目：勾了题面不等于勾了文件名，'
      + '勾了片段也不等于勾了 gold_span。下面每一行独立判定，未批准的显示拒答文案而不是假数据，'
      + '题号本身（L1）永远照常列出。</p>';
    return head + '<table><thead><tr><th>字段</th><th>内容</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + (conflicts ? '<p class="lead"><strong>本轮已知冲突（构建时按未批准处理）</strong></p><ul>' + conflicts + '</ul>' : '');
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function provenance() {
    var head = '<tr><th>行</th><th>跑分 id</th><th>口径</th><th>依据（含歧义说明）</th></tr>';
    var body = DATA.rows.map(function (r) {
      var s = r.settings || {};
      var cfg = Object.keys(s).map(function (k) { return k + '=' + s[k]; }).join(' ');
      return '<tr><td>' + r.label + '</td><td class="snippet">' + r.run_id + '</td><td>' + r.caliber
        + '</td><td class="prov">' + r.basis + '<br><span class="snippet">' + cfg + '</span></td></tr>';
    }).join('');
    return '<p class="lead">代号由本机私有盐与（文件名＋定位）哈希得到，盐不进仓库也不进产物，'
      + '所以公网无法反查代号对应哪个文件；同一台机器重复构建代号稳定。</p>'
      + '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  function render() {
    var qid = el('q').value;
    var rowKey = el('row').value;
    var q = null;
    for (var i = 0; i < DATA.questions.length; i++) { if (DATA.questions[i].id === qid) q = DATA.questions[i]; }
    if (!q) return;
    el('top').innerHTML = topTable(q, rowKey);
    el('compare').innerHTML = compareTable(q);
    el('l2').innerHTML = l2Panel(q);
    var approvedCount = ["question", "gold_doc", "excerpt"].filter(function (k) {
      return q.l2 && q.l2[k] !== null && q.l2[k] !== undefined;
    }).length;
    el('l2state').textContent = 'L2：本题 3 个字段里 ' + approvedCount + ' 个已批准';
    el('provenance').innerHTML = provenance();
  }

  fetch('data/retrieve.json').then(function (r) { return r.json(); }).then(function (data) {
    DATA = data;
    var qs = el('q');
    data.questions.forEach(function (q) {
      opt(qs, q.id, '题 ' + q.id + '（' + (q.group === 'positive' ? '正样本' : '负样本') + '）');
    });
    var rs = el('row');
    data.rows.forEach(function (r) { opt(rs, r.key, r.label + '　·　' + r.caliber); });
    rs.value = data.meta.default_row || 'v8';
    qs.onchange = render;
    rs.onchange = render;
    render();
  });
}());
