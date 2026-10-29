const auth = firebase.auth(), db = firebase.firestore();
const $ = s => document.querySelector(s);
const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const ORD = [1,2,3,4,5,6,0];
const SUG = [
  ['🌅','Acordar','07:00'],['🪥','Escovar os dentes','07:10'],['🚿','Tomar banho','07:20'],
  ['👕','Vestir-se','07:40'],['🍳','Café da manhã','08:00'],['🛏️','Arrumar a cama','08:20'],
  ['🍽️','Almoço','12:00'],['🧺','Guardar a roupa suja','18:00'],['🍲','Jantar','19:30'],
  ['🪥','Escovar os dentes (noite)','21:00'],['😴','Ir dormir','22:00']
];
let uid, pList = [], cur = null, checks = {}, tab = 'hoje', unsubP, unsubC, day = today(), last = {};

function today(){ return new Date().toLocaleDateString('sv'); }
function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function byTime(a,b){ return a.time.localeCompare(b.time); }
function toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('on'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('on'),4000); }
const pRef = () => db.doc(`users/${uid}/participants/${cur.id}`);

/* ---------- Login ---------- */
auth.onAuthStateChanged(u => {
  if (u) { uid = u.uid; listen(); }
  else { uid = null; cur = null; unsubP && unsubP(); unsubC && unsubC(); loginView(); }
});
function loginView(){
  $('#app').innerHTML = `<div class="card login"><h1>🌱 Minha Rotina</h1>
  <p class="muted">Rotinas e lembretes para uma vida mais independente.</p>
  <button onclick="loginGoogle()">Entrar com Google</button>
  <p id="err" class="err"></p></div>`;
}
async function loginGoogle(){
  const prov = new firebase.auth.GoogleAuthProvider();
  try { await auth.signInWithPopup(prov); }
  catch(e){
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      return auth.signInWithRedirect(prov);
    }
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    $('#err').textContent = 'Não foi possível entrar com o Google. (' + e.code + ')';
  }
}

/* ---------- Dados ---------- */
function listen(){
  unsubP && unsubP();
  unsubP = db.collection(`users/${uid}/participants`).orderBy('name').onSnapshot(s => {
    pList = s.docs.map(d => ({id:d.id, ...d.data()}));
    if (cur) cur = pList.find(p => p.id === cur.id) || null;
    render();
  }, e => toast('Erro ao carregar: '+e.code));
}
function watchChecks(){
  unsubC && unsubC();
  checks = {};
  unsubC = db.doc(`users/${uid}/participants/${cur.id}/checks/${today()}`).onSnapshot(d => {
    checks = (d.data() || {}).done || {}; render();
  });
}
function novoPart(){
  const name = (prompt('Nome do participante:') || '').trim();
  if (name) db.collection(`users/${uid}/participants`).add({name, emoji:'🙂', items:[]});
}
function abrir(id){ cur = pList.find(p => p.id === id); tab = 'hoje'; day = today(); watchChecks(); render(); }
function voltar(){ unsubC && unsubC(); cur = null; render(); }
function setTab(t){ tab = t; render(); }
function marcar(id, v){ db.doc(`users/${uid}/participants/${cur.id}/checks/${today()}`).set({done:{[id]:v}}, {merge:true}); }
function save(items){ return pRef().update({items}); }
async function excluir(){ if (confirm('Excluir '+cur.name+' e toda a rotina?')) { const r = pRef(); voltar(); await r.delete(); } }

/* ---------- Telas ---------- */
function render(){
  if (!uid) return;
  if (!cur) {
    $('#app').innerHTML = `<header><h1>🌱 Minha Rotina</h1><button class="sec" onclick="auth.signOut()">Sair</button></header>
    ${pList.map(p => `<div class="card part" onclick="abrir('${p.id}')"><span class="av">${p.emoji||'🙂'}</span><b>${esc(p.name)}</b></div>`).join('') || '<p class="muted">Nenhum participante ainda. Adicione o primeiro.</p>'}
    <button onclick="novoPart()">+ Novo participante</button>`;
    return;
  }
  const tabs = [['hoje','☀️ Hoje'],['rotina','✏️ Rotina'],['imp','🖨️ Imprimir']];
  $('#app').innerHTML = `<header class="noprint"><button class="sec" onclick="voltar()">← Voltar</button><h1>${esc(cur.name)}</h1></header>
  <div class="tabs noprint">${tabs.map(([k,l]) => `<button class="${tab===k?'on':''}" onclick="setTab('${k}')">${l}</button>`).join('')}</div>
  ${tab==='hoje' ? vHoje() : tab==='rotina' ? vRotina() : vImprimir()}`;
}

function vHoje(){
  const its = (cur.items||[]).filter(i => i.days.includes(new Date().getDay())).sort(byTime);
  const n = its.filter(i => checks[i.id]).length;
  const rows = its.map(i => `<label class="item ${i.type==='med'?'med':''} ${checks[i.id]?'done':''}">
    <input type="checkbox" ${checks[i.id]?'checked':''} onchange="marcar('${i.id}',this.checked)">
    <span class="ic">${i.type==='med'?'💊':esc(i.icon)}</span>
    <span class="tx"><b>${esc(i.title)}</b><small>${i.time}${i.type==='med'&&i.dose?' · '+esc(i.dose):''}</small></span></label>`).join('');
  const msg = its.length && n===its.length ? '🎉 Tudo feito hoje!' : `${n} de ${its.length} feitas`;
  return `<div class="bar"><i style="width:${its.length?n/its.length*100:0}%"></i></div>
  <p><b>${msg}</b></p>${rows || '<p class="muted">Nada para hoje. Cadastre atividades na aba Rotina.</p>'}
  ${'Notification' in window && Notification.permission!=='granted' ? '<button class="sec" onclick="pedirNotif()">🔔 Ativar lembretes</button>' : ''}
  <p class="muted">Os lembretes tocam enquanto o site estiver aberto.</p>`;
}

function vRotina(){
  const its = [...(cur.items||[])].sort(byTime);
  return `<div class="card"><h2>Nova atividade ou medicação</h2>
  <div class="chips">${SUG.map((s,k) => `<button onclick="sug(${k})">${s[0]} ${s[1]}</button>`).join('')}</div>
  <div class="row"><input id="ic" class="small" value="✅" maxlength="4" aria-label="Ícone"><input id="t" placeholder="Atividade ou remédio"></div>
  <div class="row"><input id="h" type="time" aria-label="Horário"><select id="ty" onchange="$('#ds').style.display=this.value==='med'?'block':'none'"><option value="rotina">Rotina</option><option value="med">Medicação</option></select></div>
  <input id="ds" placeholder="Dose (ex.: 1 comprimido)" style="display:none">
  <div class="days">${ORD.map(d => `<label><input class="dy" type="checkbox" value="${d}" checked>${DIAS[d]}</label>`).join('')}</div>
  <button onclick="addItem()">Salvar</button></div>
  <div class="card"><h2>Rotina cadastrada</h2>${its.map(i => `<div class="li"><span>${i.type==='med'?'💊':esc(i.icon)}</span>
  <span><b>${esc(i.title)}</b><br><small class="muted">${i.time} · ${i.days.length===7?'todos os dias':i.days.sort().map(d=>DIAS[d]).join(', ')}${i.dose?' · '+esc(i.dose):''}</small></span>
  <button class="del" onclick="delItem('${i.id}')" aria-label="Remover">🗑️</button></div>`).join('') || '<p class="muted">Ainda vazio.</p>'}</div>
  <button class="del" onclick="excluir()">Excluir participante</button>`;
}
function sug(k){ $('#ic').value=SUG[k][0]; $('#t').value=SUG[k][1]; $('#h').value=SUG[k][2]; }
function addItem(){
  const title = $('#t').value.trim(), time = $('#h').value;
  if (!title || !time) return toast('Preencha a atividade e o horário.');
  const days = [...document.querySelectorAll('.dy:checked')].map(c => +c.value);
  const it = {id:Date.now().toString(36), icon:$('#ic').value||'✅', title, time, type:$('#ty').value, dose:$('#ds').value.trim(), days:days.length?days:[0,1,2,3,4,5,6]};
  save([...(cur.items||[]), it]).then(() => toast('Salvo!'));
}
function delItem(id){ save(cur.items.filter(i => i.id !== id)); }

function vImprimir(){
  const its = [...(cur.items||[])].sort(byTime);
  return `<button class="noprint" onclick="window.print()">🖨️ Imprimir quadro semanal</button>
  <div class="sheet"><h2>Rotina de ${esc(cur.name)}</h2><p class="pm">Marque ✔ quando fizer. Quadrados listrados = não é dia.</p>
  <div class="sc"><table><tr><th>Hora</th><th>Atividade</th>${ORD.map(d => `<th>${DIAS[d]}</th>`).join('')}</tr>
  ${its.map(i => `<tr><td>${i.time}</td><td>${i.type==='med'?'💊':esc(i.icon)} ${esc(i.title)}${i.dose?' ('+esc(i.dose)+')':''}</td>${ORD.map(d => `<td class="${i.days.includes(d)?'bx':'off'}"></td>`).join('')}</tr>`).join('')}
  </table></div></div>`;
}

/* ---------- Lembretes (com o site aberto) ---------- */
function pedirNotif(){ Notification.requestPermission().then(render); }
function alarme(i){
  const txt = (i.type==='med' ? '💊 Hora do remédio: ' : i.icon+' Hora de: ') + i.title + (i.dose ? ' ('+i.dose+')' : '');
  toast(txt);
  if ('vibrate' in navigator) navigator.vibrate([300,150,300]);
  if ('Notification' in window && Notification.permission === 'granted') new Notification('Minha Rotina', {body: txt});
}
setInterval(() => {
  if (!cur) return;
  if (day !== today()) { day = today(); watchChecks(); }
  const n = new Date(), hm = n.toTimeString().slice(0,5);
  (cur.items||[]).filter(i => i.time===hm && i.days.includes(n.getDay()) && !checks[i.id] && last[i.id]!==day+hm)
    .forEach(i => { last[i.id] = day+hm; alarme(i); });
}, 15000);
