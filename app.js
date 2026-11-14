'use strict';
// デモ用: データはこのブラウザの中だけ。サーバーには何も送りません。
const KEY = 'dogu-demo-v1';
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STATE_LABEL = {in_stock:'倉庫',out:'持ち出し中',overdue:'返却遅れ',repair:'修理中',missing:'行方不明',retired:'廃棄'};
const DAY = 86400000;

function seed() {
  const now = Date.now(), at = (d, h = 8) => { const t = new Date(now + d * DAY); t.setHours(h, 0, 0, 0); return t.toISOString(); };
  const end = d => { const t = new Date(now + d * DAY); t.setHours(23, 59, 0, 0); return t.toISOString(); };
  const T = (id, name, cat, status = 'ok') => ({ id, name, cat, status });
  return {
    me: null,
    tools: [
      T('T0001','インパクトドライバー','電動工具'), T('T0002','インパクトドライバー','電動工具'),
      T('T0003','電動ドリル','電動工具'), T('T0004','丸ノコ','電動工具'),
      T('T0005','ディスクグラインダー','電動工具'), T('T0006','ハンマードリル','電動工具','repair'),
      T('T0007','レーザー墨出し器','測定器'), T('T0008','トルクレンチ','測定器'),
      T('T0009','脚立（2m）','高所・安全用具'), T('T0010','ハーネス','高所・安全用具'),
      T('T0011','発電機','機械類'), T('T0012','コードリール','電動工具'),
    ],
    people: [
      { id: 1, no: '1001', name: '佐藤 健', dept: '工事部', birth: '1990-01-05' },
      { id: 2, no: '1002', name: '鈴木 一郎', dept: '工事部', birth: '1985-07-20' },
      { id: 3, no: '1003', name: '高橋 美咲', dept: '設備部', birth: '1992-03-14' },
      { id: 4, no: '1004', name: '田中 大輔', dept: '設備部', birth: '1988-11-02' },
      { id: 5, no: '1005', name: '伊藤 結衣', dept: '工事部', birth: '1995-09-30' },
    ],
    loans: [
      { id: 1, tool: 'T0001', person: 2, site: '○○ビル改修', at: at(-5), due: end(-3), ret: null },
      { id: 2, tool: 'T0004', person: 3, site: '△△マンション', at: at(-2), due: end(-1), ret: null },
      { id: 3, tool: 'T0003', person: 1, site: '□□店舗内装', at: at(0), due: end(0), ret: null },
      { id: 4, tool: 'T0007', person: 4, site: '△△マンション', at: at(-1), due: end(2), ret: null },
      { id: 5, tool: 'T0009', person: 4, site: '△△マンション', at: at(-1), due: end(2), ret: null },
      { id: 6, tool: 'T0010', person: 5, site: '○○ビル改修', at: at(-1), due: end(0), ret: null },
    ],
  };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
if (!S || !S.tools) S = seed();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 保存できなくても動く */ } };

const openLoan = id => S.loans.find(l => l.tool === id && !l.ret);
const person = id => S.people.find(p => p.id === id);
const tool = id => S.tools.find(t => t.id === id);
function stateOf(t) {
  if (['repair', 'missing', 'retired'].includes(t.status)) return t.status;
  const l = openLoan(t.id);
  if (!l) return 'in_stock';
  return new Date(l.due) < new Date() ? 'overdue' : 'out';
}
const badge = st => `<span class="badge s-${st}">${STATE_LABEL[st]}</span>`;
const fmt = iso => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const daysLate = l => Math.max(1, Math.ceil((Date.now() - new Date(l.due)) / DAY));
const dueFor = k => { const t = new Date(); t.setDate(t.getDate() + ({ today: 0, tomorrow: 1, week: 7 }[k])); t.setHours(23, 59, 0, 0); return t.toISOString(); };

let mode = 'emp', view = 'scan', admView = 'sum', cur = null, form = { site: '', due: 'today' };
let undoSnap = null, toastTimer;

function toast(msg, withUndo = true) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(msg)}</span>${withUndo ? '<button data-act="undo">元に戻す</button>' : ''}`;
  el.hidden = false; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 8000);
}
function commit(msg) { save(); render(); toast(msg); }
function snap() { undoSnap = JSON.stringify(S); }

// ---------- 従業員（スマホ） ----------
function empView() {
  if (!S.me) return regView();
  const tabs = `<nav class="tabbar"><button class="tab ${view !== 'mine' ? 'on' : ''}" data-act="go" data-v="scan">📷 QRを読む</button><button class="tab ${view === 'mine' ? 'on' : ''}" data-act="go" data-v="mine">🎒 自分の持ち物</button></nav>`;
  let body;
  if (view === 'tool') body = toolView();
  else if (view === 'mine') body = mineView();
  else body = scanView();
  return `<div class="phone">${body}${tabs}<p class="sub" style="text-align:center"><button class="chip" data-act="logout">${esc(person(S.me).name)}さん ・ ログアウト</button></p></div>`;
}
function regView() {
  return `<div class="phone"><div class="card"><h2>はじめての登録</h2><p class="sub">このスマホを、あなた本人として登録します。最初の1回だけです。</p>
    <label>社員番号</label><input id="r-no" inputmode="numeric" value="1001">
    <label>生年月日</label><input id="r-birth" value="1990/01/05" inputmode="numeric">
    <div id="r-err" class="late" role="alert"></div>
    <button class="btn main" data-act="register">登録する</button>
    <p class="sub">デモ用: 社員番号 1001〜1005、生年月日は 1990/01/05 など自由入力（<code>19900105</code> も可）。</p></div></div>`;
}
function scanView() {
  const list = S.tools.map(t => { const st = stateOf(t); return `<div class="row"><div class="main"><div class="name">${esc(t.name)}</div><div class="sub">${esc(t.id)}</div></div><div>${badge(st)} <button class="btn small" data-act="open" data-id="${esc(t.id)}">読む</button></div></div>`; }).join('');
  return `<div class="card"><h2>QRを読む</h2><p class="sub">本物は、スマホの標準カメラで工具のQRシールを読むだけで、下の画面が開きます。デモでは、読んだことにしたい工具を選んでください。</p></div><div class="card">${list}</div>`;
}
function toolView() {
  const t = tool(cur); if (!t) return `<div class="card"><h2>見つかりません</h2><p class="sub">この工具は登録されていません。</p></div>`;
  const st = stateOf(t), l = openLoan(t.id), holder = l && person(l.person), mine = l && l.person === S.me;
  let act = '';
  if (st === 'in_stock') {
    const sites = ['○○ビル改修', '△△マンション', '□□店舗内装'];
    act = `<label>現場・用途</label><input id="f-site" value="${esc(form.site)}" placeholder="現場名を入力、または下から選ぶ">
      <div class="chips">${sites.map(s => `<button class="chip" data-act="site" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <label>返却予定</label><select id="f-due"><option value="today">今日中</option><option value="tomorrow">明日まで</option><option value="week">1週間</option></select>
      <button class="btn main" data-act="borrow">この工具を借りる</button>`;
  } else if (l) {
    act = `<div class="note">${mine ? 'あなたが持ち出し中です' : `${esc(holder.name)}さんが持ち出し中です`}（${esc(l.site)}／返却予定 ${fmt(l.due)}）</div>
      <button class="btn main" data-act="return" data-c="ok">返す（問題なし）</button>
      <button class="btn warn" data-act="return" data-c="defect">返す（不具合あり）</button>`
      + (mine ? '' : `<label>現場・用途</label><input id="f-site" value="${esc(form.site)}" placeholder="引き継ぐ先の現場名"><button class="btn" data-act="transfer">自分に引き継ぐ</button>`);
  } else act = `<div class="note">この工具は今、借りられません。</div>`;
  return `<div class="card"><div class="sub">${esc(t.id)} ・ ${esc(t.cat)}</div><div class="big">${esc(t.name)}</div><p>${badge(st)}</p>${act}<button class="btn" data-act="go" data-v="scan">もどる</button></div>`;
}
function mineView() {
  const mine = S.loans.filter(l => !l.ret && l.person === S.me);
  const rows = mine.map(l => { const t = tool(l.tool), st = stateOf(t); return `<div class="row"><div class="main"><div class="name">${esc(t.name)}</div><div class="sub">${esc(l.site)} ・ 返却予定 ${fmt(l.due)}</div></div><div>${badge(st)} <button class="btn small" data-act="open" data-id="${esc(t.id)}">開く</button></div></div>`; }).join('');
  return `<div class="card"><h2>自分の持ち物</h2>${rows || '<p class="sub">いま持っている工具はありません。</p>'}</div>`;
}

// ---------- 事務員さん ----------
function admView_() {
  const nav = [['sum', '状況'], ['holders', '人別'], ['tools', '工具'], ['labels', 'QRラベル']].map(([k, n]) => `<button class="chip ${admView === k ? 'on' : ''}" data-act="adm" data-v="${k}">${n}</button>`).join('');
  let body;
  if (admView === 'holders') body = holdersView(); else if (admView === 'tools') body = toolsView(); else if (admView === 'labels') body = labelsView(); else body = sumView();
  return `<div class="nav">${nav}</div>${body}`;
}
function sumView() {
  const c = {}; S.tools.forEach(t => { const s = stateOf(t); c[s] = (c[s] || 0) + 1; });
  const tile = (k, cls = '') => `<div class="tile ${cls}"><span class="sub">${STATE_LABEL[k]}</span><b>${c[k] || 0}</b></div>`;
  const od = S.loans.filter(l => !l.ret && stateOf(tool(l.tool)) === 'overdue');
  const rows = od.map(l => `<tr><td>${esc(tool(l.tool).name)}<div class="sub">${esc(l.tool)}</div></td><td>${esc(person(l.person).name)}</td><td>${esc(l.site)}</td><td class="late">${daysLate(l)}日遅れ</td></tr>`).join('');
  return `<div class="tiles">${tile('in_stock')}${tile('out')}${tile('overdue', (c.overdue || 0) ? 'alert' : '')}${tile('repair')}</div>
    <div class="card"><h3>返却が遅れている工具</h3>${rows ? `<div class="scroll"><table><tr><th>工具</th><th>持っている人</th><th>現場</th><th>遅れ</th></tr>${rows}</table></div><p class="sub">本物では、持っている人に毎朝メールで返却をお願いします。</p>` : '<p class="sub">遅れている工具はありません 🎉</p>'}</div>
    <div class="card"><h3>月に1回の「持っていますか？」確認</h3><p class="sub">本物では、持ち出し中の人にメールで確認します。答えがない工具や「持っていない」と答えた工具が、ここに一覧で出ます。（デモでは未実装）</p></div>`;
}
function holdersView() {
  const rows = S.people.map(p => { const ls = S.loans.filter(l => !l.ret && l.person === p.id); if (!ls.length) return ''; const late = ls.some(l => stateOf(tool(l.tool)) === 'overdue');
    return `<div class="row"><div class="main"><div class="name">${esc(p.name)} <span class="sub">${esc(p.dept)}</span></div><div class="sub">${ls.map(l => esc(tool(l.tool).name)).join('、')}</div></div><div>${late ? badge('overdue') + ' ' : ''}<b>${ls.length}点</b></div></div>`; }).join('');
  return `<div class="card"><h3>誰が何を持っているか</h3>${rows || '<p class="sub">持ち出し中の工具はありません。</p>'}</div>`;
}
function toolsView() {
  const rows = S.tools.map(t => { const l = openLoan(t.id); return `<tr><td>${esc(t.id)}</td><td>${esc(t.name)}</td><td>${esc(t.cat)}</td><td>${badge(stateOf(t))}</td><td>${l ? esc(person(l.person).name) : '—'}</td></tr>`; }).join('');
  return `<div class="card"><h3>工具一覧（${S.tools.length}点）</h3><div class="scroll"><table><tr><th>番号</th><th>名前</th><th>区分</th><th>状態</th><th>持ち主</th></tr>${rows}</table></div></div>`;
}
function labelsView() {
  return `<div class="card"><h3>QRシール（印刷用）</h3><p class="sub">工具1個ずつに貼る、番号つきのQRシールです。本物では、選んだ工具をA4にまとめて印刷します。読むと、その工具の画面が開きます。</p></div><div class="labels">${S.tools.map(t => `<div class="label"><div class="qr" data-qr="${esc(t.id)}"></div><div class="id">${esc(t.id)}</div><div class="nm">${esc(t.name)}</div></div>`).join('')}</div>`;
}

// ---------- 描画・操作 ----------
function render() {
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  document.getElementById('app').innerHTML = mode === 'emp' ? empView() : admView_();
  if (mode === 'adm' && admView === 'labels' && window.QRCode) {
    document.querySelectorAll('[data-qr]').forEach(el => new QRCode(el, { text: 'https://example.com/t/' + el.dataset.qr, width: 96, height: 96 }));
  }
}
const val = id => (document.getElementById(id) || {}).value || '';
function normBirth(s) {
  const z = s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[年月\/.\-]/g, '/').replace(/日/g, '').trim();
  let m = z.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/) || z.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}` : null;
}
document.addEventListener('click', e => {
  const m = e.target.closest('[data-mode]'); if (m) { mode = m.dataset.mode; render(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'go') { view = b.dataset.v; render(); }
  else if (a === 'adm') { admView = b.dataset.v; render(); }
  else if (a === 'open') { cur = b.dataset.id; view = 'tool'; form = { site: '', due: 'today' }; render(); }
  else if (a === 'site') { form.site = b.dataset.s; document.getElementById('f-site').value = b.dataset.s; }
  else if (a === 'register') {
    const p = S.people.find(x => x.no === val('r-no').trim()), bd = normBirth(val('r-birth'));
    if (!p || !bd || p.birth !== bd) { document.getElementById('r-err').textContent = '社員番号か生年月日が違います。もう一度ご確認ください。'; return; }
    S.me = p.id; view = 'scan'; save(); render(); toast(p.name + 'さん、登録しました', false);
  }
  else if (a === 'logout') { S.me = null; save(); render(); }
  else if (a === 'borrow') {
    const site = val('f-site').trim(); if (!site) { toast('現場・用途を入れてください', false); return; }
    if (openLoan(cur)) return; // 二重タップ対策
    snap(); S.loans.push({ id: Date.now(), tool: cur, person: S.me, site, at: new Date().toISOString(), due: dueFor(val('f-due')), ret: null });
    view = 'mine'; commit('✓ 借りました：' + tool(cur).name);
  }
  else if (a === 'return') {
    const l = openLoan(cur); if (!l) return; snap(); l.ret = new Date().toISOString(); l.retBy = S.me;
    if (b.dataset.c === 'defect') tool(cur).status = 'repair';
    view = 'scan'; commit('✓ 返しました：' + tool(cur).name + (b.dataset.c === 'defect' ? '（修理中にしました）' : ''));
  }
  else if (a === 'transfer') {
    const l = openLoan(cur), site = val('f-site').trim() || l.site; if (!l) return; snap(); l.ret = new Date().toISOString(); l.retBy = S.me;
    S.loans.push({ id: Date.now(), tool: cur, person: S.me, site, at: new Date().toISOString(), due: dueFor('today'), ret: null });
    view = 'mine'; commit('✓ 引き継ぎました：' + tool(cur).name);
  }
  else if (a === 'undo') { if (undoSnap) { S = JSON.parse(undoSnap); undoSnap = null; save(); document.getElementById('toast').hidden = true; render(); } }
});
document.addEventListener('input', e => { if (e.target.id === 'f-site') form.site = e.target.value; });
render();
