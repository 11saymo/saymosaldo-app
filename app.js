
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let KEY='saymosaldo_';
const KEYS=['tx','goals','budgets','recurring','debts'];
const scopedKey=k=>KEY+k;
const load=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(KEY+k));return Array.isArray(v)?v:d}catch{return d}};
const S={tx:load('tx',[]),goals:load('goals',[]),budgets:load('budgets',[]),recurring:load('recurring',[]),debts:load('debts',[])};
function persistEntries(entries){
  const previous={};
  try{
    for(const key of Object.keys(entries))previous[key]=localStorage.getItem(key);
  }catch(e){
    toast('Хранилище браузера недоступно. Данные пока не сохранены — скачайте резервную копию, если записи уже есть.');
    return false;
  }
  try{
    for(const [key,value] of Object.entries(entries))localStorage.setItem(key,value);
    return true;
  }catch(e){
    for(const [key,value] of Object.entries(previous)){
      try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value)}catch(ignore){}
    }
    toast('Не удалось сохранить данные: возможно, закончилось место в браузере. Освободите место и создайте резервную копию.');
    return false;
  }
}
const save=()=>{
  const previous={};
  try{
    for(const k of KEYS){
      const raw=localStorage.getItem(scopedKey(k));
      const value=raw===null?[]:JSON.parse(raw);
      previous[k]=Array.isArray(value)?value:[];
    }
  }catch(e){
    toast('Не удалось прочитать сохранённые данные. Не закрывайте страницу и попробуйте скачать резервную копию.');
    return false;
  }
  const modifiedAt=new Date().toISOString();
  const entries=Object.fromEntries(KEYS.map(k=>[scopedKey(k),JSON.stringify(S[k])]));
  entries[scopedKey('local_modified_at')]=modifiedAt;
  entries[scopedKey('pending_sync')]='1';
  if(!persistEntries(entries)){
    for(const k of KEYS)S[k]=previous[k];
    return false;
  }
  if(cloudSaveHandler)cloudSaveHandler();
  return true;
};
let cloudSaveHandler=null;
const CATS={expense:['Продукты','Кафе и рестораны','Транспорт','Покупки','Дом','Здоровье','Развлечения','Подписки','Кредиты и долги','Другое'],income:['Зарплата','Подработка','Подарок','Другое']};
const DEBT_KINDS=['Ипотека','Кредит','Кредитная карта','Рассрочка','Частный долг'];
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today=()=>ymd(new Date()), nowMk=()=>today().slice(0,7);
const money=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(+n||0)+' ₽';
const currencyMoney=(n,c='RUB')=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(+n||0)+' '+c;
const currencySelect=(selected='RUB')=>`<select name="currency">${(window.SaymoSaldoCurrency?.options()||[{code:'RUB',label:'RUB — Российский рубль'},{code:'USD',label:'USD — Доллар США'},{code:'EUR',label:'EUR — Евро'},{code:'CNY',label:'CNY — Китайский юань'}]).map(x=>`<option value="${x.code}" ${x.code===selected?'selected':''}>${esc(x.label)}</option>`).join('')}</select>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=s=>new Date(s+'T12:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
const monthName=k=>new Date(k+'-15T12:00').toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
const total=a=>a.reduce((v,x)=>v+(+x||0),0);
const sumType=(a,t)=>total(a.filter(x=>x.type===t).map(x=>x.amount));
const monthTx=k=>S.tx.filter(x=>String(x.date).slice(0,7)===k);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const empty=t=>`<div class="empty">${t}</div>`;
const catOpts=t=>CATS[t].map(c=>`<option>${esc(c)}</option>`).join('');
const FIELD_HELP={name:'Дайте понятное название, чтобы потом легко узнать запись.',target:'Укажите полную сумму, которую хотите накопить.',saved:'Укажите, сколько уже отложено на эту цель. Если пока ничего — оставьте пустым или введите 0.',date:'При желании укажите дату, к которой хотите достичь цели.',limit:'Максимальная сумма расходов по выбранной категории за месяц.',amount:'Введите сумму одного регулярного платежа в рублях.',day:'Введите число месяца от 1 до 31, когда обычно наступает платёж.',original:'Полная сумма обязательства на момент оформления, а не текущий остаток.',remaining:'Сколько осталось выплатить на сегодняшний день. Значение не должно превышать первоначальную сумму.',monthly:'Сколько обычно платите каждый месяц.',rate:'Укажите годовую процентную ставку из договора. Если не знаете — оставьте поле пустым.'};
const field=(n,l,t='number',x='')=>`<label class="field"><span>${l}</span><input name="${n}" type="${t}" ${t==='number'?'inputmode="decimal" step="any"':''} ${x}>${FIELD_HELP[n]?`<small class="field-help">${FIELD_HELP[n]}</small>`:''}</label>`;
let mode='finance', tab='recurring', cur='home';

function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('on'),2400)}

const TITLES={home:'Главная',ops:'Операции',add:'Новая операция',stats:'Бюджет',more:'Ещё'};
function go(p){
  cur=p;
  $$('.view').forEach(v=>v.hidden=v.dataset.view!==p);
  $$('.nav [data-go]').forEach(b=>b.setAttribute('aria-current',b.dataset.go===p?'page':'false'));
  $('#title').textContent=TITLES[p];
  if(p==='add'){$('#txForm [name=date]').value=today();fillTx()}
  window.scrollTo(0,0);
  render();
}

function editGoal(id){
  const g=S.goals.find(x=>String(x.id)===String(id));
  if(!g){toast('Цель не найдена.');return}
  const d=$('#dlg');
  d.innerHTML=`<form class="dlgf"><h2>Редактировать цель</h2>
    ${field('name','Название','text',`value="${esc(g.name)}" required maxlength="80"`)}
    ${field('target','Сумма цели','number',`value="${esc(g.target)}" required min="1" step="any"`)}
    ${field('saved','Уже отложено','number',`value="${esc(g.saved)}" required min="0" step="any"`)}
    <label class="field"><span>Валюта цели</span>${currencySelect(g.currency||'RUB')}</label>
    ${field('date','Срок достижения','date',`value="${esc(g.date||'')}"`)}
    <label class="field"><span>Тип цели</span><select name="kind"><option value="standard" ${g.kind==='deposit'?'':'selected'}>Обычная цель</option><option value="deposit" ${g.kind==='deposit'?'selected':''}>Накопительная с процентами</option></select></label>
    ${field('rate','Годовая ставка, %','number',`value="${esc(g.rate||'')}" min="0" max="100" step="0.01"`)}
    <p class="muted" style="margin:0 0 12px">Накопленная сумма сохранится без изменений, если вы её не поменяете. ${esc(goalPreviewText(g))}</p>
    <p class="err" id="dlgErr"></p><div class="row end"><button type="button" data-act="dlg-cancel">Отмена</button><button class="primary">Сохранить изменения</button></div></form>`;
  d.querySelector('form').addEventListener('submit',e=>{
    e.preventDefault();
    const v=Object.fromEntries(new FormData(e.target));
    const name=String(v.name||'').trim(),target=Math.round(Number(v.target)*100)/100,saved=Math.round(Number(v.saved)*100)/100,oldCurrency=g.currency||'RUB',newCurrency=v.currency||'RUB';
    if(!name){$('#dlgErr').textContent='Укажите название цели.';return}
    if(!Number.isFinite(target)||target<=0){$('#dlgErr').textContent='Сумма цели должна быть больше нуля.';return}
    if(!Number.isFinite(saved)||saved<0){$('#dlgErr').textContent='Уже отложенная сумма не может быть отрицательной.';return}
    if(v.kind==='deposit'&&(!Number.isFinite(Number(v.rate))||Number(v.rate)<0||Number(v.rate)>100)){$('#dlgErr').textContent='Ставка должна быть от 0 до 100%.';return}
    if(newCurrency!==oldCurrency){const oldRate=oldCurrency==='RUB'?1:window.SaymoSaldoCurrency?.rubPerUnit(oldCurrency),newRate=newCurrency==='RUB'?1:window.SaymoSaldoCurrency?.rubPerUnit(newCurrency);if(!Number.isFinite(oldRate)||!Number.isFinite(newRate)||newRate<=0){$('#dlgErr').textContent='Курс валюты пока недоступен. Не меняйте валюту или попробуйте позже.';return}const factor=oldRate/newRate;g.target=Math.round(g.target*factor*100)/100;g.saved=Math.round(g.saved*factor*100)/100;}else{g.target=target;g.saved=saved;}g.currency=newCurrency;g.name=name;g.date=v.date||'';g.kind=v.kind==='deposit'?'deposit':'standard';g.rate=g.kind==='deposit'?Number(v.rate)||0:0;
    if(!save())return;render();d.close();toast('Цель обновлена');
  });
  d.showModal();
}

function ask(title,fields,cb){
  const d=$('#dlg');
  d.innerHTML=`<form class="dlgf"><h2>${esc(title)}</h2>${fields.map(f=>field(f.n,f.l,'number',`value="${esc(f.v??'')}" required`)).join('')}<p class="err" id="dlgErr"></p><div class="row end"><button type="button" data-act="dlg-cancel">Отмена</button><button class="primary">Сохранить</button></div></form>`;
  d.querySelector('form').addEventListener('submit',e=>{
    e.preventDefault();
    const err=cb(Object.fromEntries(new FormData(e.target)));
    if(err){$('#dlgErr').textContent=err;return}
    d.close();
  });
  d.showModal();
}

const ICON={'Продукты':'🛒','Кафе и рестораны':'☕','Транспорт':'🚌','Покупки':'🛍️','Дом':'🏠','Здоровье':'💊','Развлечения':'🎬','Подписки':'📺','Кредиты и долги':'🏦','Зарплата':'💼','Подработка':'🛠️','Подарок':'🎁'};
const items=(list,del)=>list.map(x=>{const saving=x.type==='saving',income=x.type==='income',currency=x.currency||'RUB',original=Number(x.originalAmount??x.amount),foreign=currency!=='RUB'?`<small>${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(original)} ${esc(currency)} · ${money(x.amount)}</small>`:'';return `<div class="item"><div style="display:flex;align-items:center;min-width:0"><span class="ico">${saving?'🎯':ICON[x.category]||'📦'}</span><div style="min-width:0"><b>${esc(x.comment||x.category)}</b><small>${x.comment?esc(x.category)+' · ':''}${fmtDate(x.date)}</small>${foreign}</div></div><div class="amt ${income||saving?'pos':''}">${saving?'↗':income?'+':'−'}${money(x.amount)}${del?`<button class="link" data-act="tx-del" data-id="${esc(x.id)}">Удалить</button>`:''}</div></div>`}).join('');
const bar=(l,v,max)=>`<div class="bl"><div class="row"><span>${esc(l)}</span><b>${money(v)}</b></div><div class="bar"><i style="width:${Math.max(2,v/max*100)}%"></i></div></div>`;
const goalCard=(g,compact)=>{const p=g.target?Math.min(100,g.saved/g.target*100):0,projection=goalProjection(g),c=g.currency||'RUB';return `<div class="card goal-card"><div class="goal-head"><b class="goal-title">${esc(g.name)}</b><span class="goal-percent">${Math.round(p)}%</span></div><div class="goal-meta"><span>Накоплено</span><b>${currencyMoney(g.saved,c)} <span>из ${currencyMoney(g.target,c)}</span></b>${g.date?`<small>Срок: ${fmtDate(g.date)}</small>`:''}${g.kind==='deposit'?`<small>Накопительная · ${Number(g.rate)||0}% годовых</small>`:''}${g.date?`<small>Нужно откладывать: ${currencyMoney(projection.monthly,c)} в месяц</small>`:''}${g.kind==='deposit'?(g.date?`<small>Прогноз процентов за период: ${currencyMoney(projection.interest,c)}</small>`:`<small>Доход за месяц при текущем остатке: ${currencyMoney((Number(g.saved)||0)*(Number(g.rate)||0)/1200,c)}</small>`):''}</div><div class="bar"><i style="width:${p}%"></i></div>${compact?'':`<div class="actions"><button class="ghost" data-act="goal-fund" data-id="${esc(g.id)}">Пополнить</button><button class="ghost" data-act="goal-edit" data-id="${esc(g.id)}">Редактировать</button><button class="ghost danger" data-act="goal-del" data-id="${esc(g.id)}">Удалить</button></div>`}</div>`};

function migrateGoalSavingsToOperations(){
  let changed=false;
  for(const goal of S.goals){
    const saved=Math.max(0,Number(goal.saved)||0);
    if(!saved)continue;
    const logged=S.tx.filter(tx=>tx.type==='saving'&&String(tx.goalId)===String(goal.id)).reduce((sum,tx)=>sum+Math.max(0,Number(tx.amount)||0),0);
    const missing=Math.round((saved-logged)*100)/100;
    if(missing>0.009){S.tx.push({id:uid(),created:Date.now(),type:'saving',amount:missing,category:'Накопления',date:today(),comment:'Учтённый остаток цели: '+goal.name,goalId:goal.id,currency:'RUB',originalAmount:missing,exchangeRate:1});changed=true;}
  }
  if(changed)save();
}

function render(){
  migrateGoalSavingsToOperations();
  const k=nowMk(), m=monthTx(k), monthInc=sumType(m,'income'), monthOut=sumType(m,'expense');
  const inc=sumType(S.tx,'income'), out=sumType(S.tx,'expense');
  const spent=c=>total(m.filter(x=>x.type==='expense'&&x.category===c).map(x=>x.amount));
  const overN=S.budgets.filter(b=>spent(b.category)>b.limit).length;
  const h=new Date().getHours();
  $('#greet').textContent=(h<12?'Доброе утро':h<18?'Добрый день':'Добрый вечер')+', рады видеть вас в SaymoSaldo!';
  $('#monthLabel').textContent='За всё время';
  $('#balance').textContent=money(inc-out);
  $('#income').textContent=money(inc);
  $('#expense').textContent=money(out);
  $('#status').textContent=!S.tx.length?'Добавьте первую операцию, и общая картина появится здесь.':overN?`Превышено лимитов: ${overN}. Проверьте категории ниже.`:'Всё под контролем.';
   const insightEl=$('#moneyInsight');
   const todayDate=new Date(),dayOfMonth=todayDate.getDate(),daysInMonth=new Date(todayDate.getFullYear(),todayDate.getMonth()+1,0).getDate();
   const expenseRows=m.filter(x=>x.type==='expense'&&Number(x.amount)>0);
   const categoryTotals={};
   expenseRows.forEach(x=>{const c=String(x.category||'Другое');categoryTotals[c]=(categoryTotals[c]||0)+Number(x.amount||0)});
   const canForecast=dayOfMonth>=5&&expenseRows.length>=3;
   const projectedOut=canForecast?monthOut/dayOfMonth*daysInMonth:null;
   const projectedIn=canForecast?monthInc/dayOfMonth*daysInMonth:null;
   const projectedNet=canForecast?projectedIn-projectedOut:null;
   const topCategory=Object.entries(categoryTotals).sort((a,b)=>b[1]-a[1])[0];
   const nearLimit=S.budgets.map(b=>({category:b.category,spent:categoryTotals[b.category]||0,limit:Number(b.limit)||0})).filter(x=>x.limit>0).sort((a,b)=>b.spent/b.limit-a.spent/a.limit)[0];
   let insight='';
   if(nearLimit&&nearLimit.spent>=nearLimit.limit*.8){
     const pct=Math.round(nearLimit.spent/nearLimit.limit*100);
     insight=`Лимит «${esc(nearLimit.category)}» использован на ${pct}%. Осталось ${money(Math.max(0,nearLimit.limit-nearLimit.spent))}.`;
   }else if(topCategory){
     insight=`Больше всего расходов сейчас в категории «${esc(topCategory[0])}» — ${money(topCategory[1])}.`;
   }else{
     insight='Добавляйте операции — здесь появятся персональные подсказки по расходам и лимитам.';
   }
   insightEl.innerHTML=`<div class="card forecast-card"><div class="forecast-head"><b>Финансовый прогноз</b><span class="forecast-tag">${canForecast?'По текущему темпу':'Набираем данные'}</span></div>${canForecast?`<div class="forecast-grid"><div class="forecast-metric"><span>Расходы к концу месяца</span><b>${money(projectedOut)}</b></div><div class="forecast-metric"><span>Доходы к концу месяца</span><b>${money(projectedIn)}</b></div><div class="forecast-metric"><span>Прогноз разницы</span><b class="${projectedNet>=0?'pos':''}">${money(projectedNet)}</b></div><div class="forecast-metric"><span>Дней прошло</span><b>${dayOfMonth} из ${daysInMonth}</b></div></div><small class="forecast-note">Оценка по среднему дневному темпу записей этого месяца. Это не банковский баланс; будущие платежи, незаписанные операции и изменения дохода не учитываются.</small>`:`<p class="muted">Для прогноза нужно немного больше записей. После нескольких дней и операций покажем ориентир до конца месяца.</p>`}<div class="insight-line"><b>Подсказка</b><br>${insight}</div></div>`;
  const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(ymd(d))}
  const dv=days.map(dd=>S.tx.filter(x=>x.type==='expense'&&x.date===dd).reduce((v,x)=>v+(+x.amount||0),0));
  const wmax=Math.max(...dv,1);
  $('#week').innerHTML=days.map((dd,i)=>`<div class="wd"><div class="wb"><i style="height:${Math.max(4,dv[i]/wmax*100)}%"></i></div><small>${new Date(dd+'T12:00').toLocaleDateString('ru-RU',{weekday:'short'}).slice(0,2)}</small></div>`).join('');
  const sorted=[...S.tx].sort((a,b)=>String(b.date).localeCompare(String(a.date))||(b.created||0)-(a.created||0));
  $('#recent').innerHTML=items(sorted.slice(0,3),false)||empty('Операций пока нет. Добавьте первую — это займёт минуту.');
  const f=$('#filter').value, list=sorted.filter(x=>f==='all'||(f==='saving'?x.type==='saving':x.type===f));
  $('#count').textContent=list.length+' шт.';
  $('#allItems').innerHTML=items(list,true)||empty('Нет операций по выбранному фильтру.');
  renderHomeCurrencyRates();
  const ring=p=>`<svg class="ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" class="rt"/><circle cx="18" cy="18" r="15.9" class="rv" stroke-dasharray="${Math.min(100,p)} 100"/></svg>`;
  $('#homeGoals').innerHTML=S.goals.slice(0,3).map(g=>{const p=g.target?Math.min(100,g.saved/g.target*100):0;return `<div class="item home-goal-item"><div class="ringbox">${ring(p)}<span>${Math.round(p)}%</span></div><div class="home-goal-copy"><b>${esc(g.name)}</b><small><span>Накоплено</span> ${money(g.saved)} <span>из</span> ${money(g.target)}</small></div></div>`}).join('')||empty('Цели пока не добавлены.');
  const debtTotal=total(S.debts.map(d=>d.remaining));
  $('#homeDebts').innerHTML=S.debts.length?`<div class="card home-debt-total"><span class="label">Общая задолженность</span><div class="big">${money(debtTotal)}</div>${S.debts.slice(0,3).map(d=>{const original=Math.max(+d.original||0,+d.remaining||0),paid=Math.max(0,original-(+d.remaining||0)),p=original?paid/original*100:0;return `<div class="home-debt-row"><div class="row"><b>${esc(d.name)}</b><b>${money(d.remaining)}</b></div><small>${esc(d.kind)} · платёж ${money(d.monthly)} в месяц</small><div class="bar"><i style="width:${p}%"></i></div></div>`}).join('')}${S.debts.length>3?`<small>И ещё ${S.debts.length-3} обязательств</small>`:''}<button class="ghost" data-go="more" data-tab-target="debts">Открыть задолженность</button></div>`:empty('Задолженностей пока нет. Добавьте кредит или другое обязательство в разделе «Ещё».');
  $('#homeLimits').innerHTML=S.budgets.slice(0,3).map(b=>{const sp=spent(b.category),p=b.limit?sp/b.limit*100:0,cl=p>=100?'over':p>=80?'warn':'';return `<div class="card"><div class="row"><b>${esc(b.category)}</b><small>${money(sp)} из ${money(b.limit)}</small></div><div class="bar"><i class="${cl}" style="width:${Math.min(100,p)}%"></i></div><small>${p>100?`Превышение на ${money(sp-b.limit)}`:`Осталось ${money(Math.max(0,b.limit-sp))}`}</small></div>`}).join('')||empty('Лимиты не установлены. Их можно задать в разделе «Бюджет».');
  const by={};
  m.filter(x=>x.type==='expense').forEach(x=>by[x.category]=(by[x.category]||0)+(+x.amount||0));
  const ents=Object.entries(by).sort((a,b)=>b[1]-a[1]), max=ents[0]?.[1]||1;
  $('#catStats').innerHTML=ents.map(([c,v])=>bar(c,v,max)).join('')||empty('Добавьте расходы — здесь появится разбивка по категориям.');
  const ks=[];for(let i=5;i>=0;i--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);ks.push(ymd(d).slice(0,7))}
  const vals=ks.map(q=>sumType(monthTx(q),'expense')), mx=Math.max(...vals,1);
  $('#monthStats').innerHTML=ks.map((q,i)=>bar(monthName(q),vals[i],mx)).join('');
  $('#budgetWrap').innerHTML=PANELS.goals()+PANELS.budgets();
  renderPanel();
 }

const PANELS={
  goals:()=>`${S.goals.map(g=>goalCard(g)).join('')||empty('Цели пока не добавлены. Например, накопления на отпуск.')}
    <div class="sec"><h2>Новая цель</h2></div>
    <form class="card" data-form="goal"><label class="field"><span>Название</span><input name="name" type="text" required maxlength="80" placeholder="Отпуск"></label>${field('target','Сумма цели','number','required min="0.01" step="any"')}${field('saved','Уже отложено','number','min="0" step="any"')}<label class="field"><span>Валюта цели</span>${currencySelect('RUB')}</label><label class="field"><span>Тип цели</span><select name="kind"><option value="standard">Обычная цель</option><option value="deposit">Накопительная с процентами</option></select></label>${field('rate','Годовая ставка, %','number','min="0" max="100" step="0.01" placeholder="Например, 12"')}<small class="field-help">Для обычной цели оставьте ставку 0. Для накопительной укажите ставку из условий вклада или накопительного счёта.</small>${field('date','Срок достижения','date')}<p class="field-help" id="goalPreview" aria-live="polite"></p><button class="primary">Создать цель</button></form>`,

  budgets:()=>{
    const m=monthTx(nowMk()).filter(x=>x.type==='expense');
    return `${S.budgets.map(b=>{const sp=total(m.filter(x=>x.category===b.category).map(x=>x.amount)),p=b.limit?sp/b.limit*100:0,cl=p>=100?'over':p>=80?'warn':'';return `<div class="card"><div class="row"><b>${esc(b.category)}</b><button class="link danger" data-act="budget-del" data-cat="${esc(b.category)}">Удалить</button></div><div class="bar"><i class="${cl}" style="width:${Math.min(100,p)}%"></i></div><small>${money(sp)} из ${money(b.limit)} · ${Math.round(p)}%</small><small>${p>100?`Превышение на ${money(sp-b.limit)}`:`Осталось ${money(Math.max(0,b.limit-sp))}`}</small></div>`}).join('')||empty('Лимиты не установлены.')}
    <div class="sec"><h2>Новый лимит на месяц</h2></div>
    <form class="card" data-form="budget"><label class="field"><span>Категория</span><select name="category">${catOpts('expense')}</select><small class="field-help">Выберите категорию, для которой хотите ограничить расходы в текущем месяце.</small></label>${field('limit','Лимит, ₽','number','required min="1"')}<button class="primary">Сохранить лимит</button></form>`;
  },

  recurring:()=>{
    const plan=total(S.recurring.map(r=>r.amount))+total(S.debts.filter(d=>d.remaining>0).map(d=>d.monthly));
    return `<div class="card"><span class="label">Плановые платежи в месяц</span><div class="big">${money(plan)}</div><small>Плановая сумма по введённым данным, а не списание и не банковский прогноз.</small></div>
    ${S.recurring.map(r=>`<div class="card"><div class="row"><b>${esc(r.name)}</b><b>${money(r.amount)}</b></div><small>${esc(r.category)} · ${r.day}-го числа</small><div class="actions"><button class="ghost" data-act="rec-pay" data-id="${esc(r.id)}">Отметить оплаченным</button><button class="ghost danger" data-act="rec-del" data-id="${esc(r.id)}">Удалить</button></div></div>`).join('')||empty('Регулярных платежей пока нет: аренда, связь, подписки.')}
    <div class="sec"><h2>Новый платёж</h2></div>
    <form class="card" data-form="rec">${field('name','Название','text','required placeholder="Интернет"')}${field('amount','Сумма, ₽','number','required min="1"')}<label class="field"><span>Категория</span><select name="category">${catOpts('expense')}</select><small class="field-help">Выберите категорию, в которой учитывать этот платёж.</small></label>${field('day','День месяца (1–31)','number','required min="1" max="31"')}<button class="primary">Добавить</button></form>`;
  },

  debts:()=>{
    const rem=total(S.debts.map(d=>d.remaining));
    return `<div class="card"><span class="label">Общая задолженность</span><div class="big">${money(rem)}</div><small>Каждый закрытый платёж — шаг вперёд. Сравнивать свой путь с чужим не нужно.</small></div>
    ${S.debts.map(d=>{const rm=+d.remaining||0,o=Math.max(+d.original||0,rm),pd=Math.max(0,o-rm),p=o?pd/o*100:0;return `<div class="card"><div class="row"><b>${esc(d.name)}</b><b>${money(rm)}</b></div><small>${esc(d.kind)} · платёж ${money(d.monthly)} · ${d.day}-го${d.rate?` · ${esc(d.rate)}% годовых`:''}</small><div class="bar"><i style="width:${p}%"></i></div><small>${Math.round(p)}% · погашено ${money(pd)} из ${money(o)}</small><div class="actions"><button class="ghost" data-act="debt-pay" data-id="${esc(d.id)}"${rm<=0?' disabled':''}>Отметить платёж</button><button class="ghost danger" data-act="debt-del" data-id="${esc(d.id)}">Удалить</button></div></div>`}).join('')||empty('Здесь появится общий остаток, когда вы добавите обязательство.')}
    <div class="sec"><h2>Новое обязательство</h2></div>
    <form class="card" data-form="debt"><label class="field"><span>Тип</span><select name="kind">${DEBT_KINDS.map(k=>`<option>${k}</option>`).join('')}</select><small class="field-help">Выберите вид обязательства: например, кредит, ипотека или долг другому человеку.</small></label>${field('name','Название','text','required placeholder="Ипотека, банк"')}${field('original','Первоначальная сумма, ₽','number','required min="1"')}${field('remaining','Текущий остаток, ₽','number','required min="0"')}${field('monthly','Ежемесячный платёж, ₽','number','required min="1"')}${field('day','День платежа (1–31)','number','required min="1" max="31"')}${field('rate','Ставка, % годовых (необязательно)','number','min="0" max="100"')}<button class="primary">Добавить</button></form>`;
  },

  assistant:()=>`<p class="muted">Бесплатный финансовый аналитик SaymoSaldo. Отчёты и ответы рассчитываются прямо на устройстве — финансовые записи не отправляются внешнему ИИ.</p>
    <div id="assistantReport"></div>
    <div class="sec"><h2>Спросите о своих финансах</h2></div>
    <div id="chat" class="chat"></div>
    <div class="chips">${['На что я больше всего трачу?','Сравни с прошлым месяцем','Какие лимиты под угрозой?','Как сократить расходы?','Сколько уходит на платежи?','Как продвигаются мои цели?'].map(q=>`<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <form class="chatform" data-form="chat"><input name="q" autocomplete="off" placeholder="Например, сколько я могу отложить?"><button class="primary">Отправить</button></form>
    <div class="actions"><button class="link" data-act="chat-clear">Очистить историю этого режима</button></div>`,

  settings:()=>{const cur=document.documentElement.dataset.theme||'auto';return `<div class="card"><h2>Курсы валют</h2><p class="muted">Ориентировочные курсы к рублю. Источник — открытый сервис обменных курсов; перед обменом проверьте курс банка.</p><div id="currencyRates" class="list"><small>Загружаем курсы…</small></div><div class="actions"><button class="ghost" data-act="currency-refresh">Обновить курсы</button></div></div><div class="card"><h2>Аккаунт</h2><p class="muted" style="margin:6px 0 12px">Вы вошли как <b>${esc(window.SaymoSaldoAuth?.username||'')}</b>. Данные аккаунта синхронизируются между вашими устройствами.</p><button class="ghost danger" data-auth-action="logout">Выйти</button></div><div class="card"><h2>Обучение</h2><p class="muted" style="margin:6px 0 12px">Короткий обзор основных разделов.</p><button class="ghost" data-act="tour-start">Показать обучение</button></div><div class="card"><h2>Оформление</h2><p class="muted" style="margin:6px 0 14px">Тема сохраняется на этом устройстве.</p><div class="tabs" style="margin:0">${[['light','Светлая'],['dark','Тёмная'],['auto','Как в телефоне']].map(([v,l])=>`<button data-theme-set="${v}" aria-selected="${cur===v}">${l}</button>`).join('')}</div></div>`},
  data:()=>`<div class="card"><h2>О приложении и доступе</h2><p>SaymoSaldo помогает учитывать доходы и расходы, планировать бюджет, отслеживать цели, регулярные платежи и задолженности.</p><p class="muted" style="margin-top:8px">Финансовые записи синхронизируются через аккаунт и сохраняются локально для быстрой работы и временного доступа без сети. Доступ к облачным записям ограничен вашим аккаунтом. Локальная копия в браузере не шифруется отдельным паролем — защищайте устройство блокировкой экрана.</p><p style="margin-top:8px"><a href="./privacy.html">Политика конфиденциальности</a></p></div><div class="card"><h2>Данные на этом устройстве</h2><p class="muted">Финансовые записи сохраняются в аккаунте и в локальном хранилище браузера для быстрой работы. Локальная копия не шифруется отдельным паролем — защищайте устройство блокировкой экрана.</p></div><div class="card"><h2>Резервная копия</h2><p>Сохраняйте копию вручную, особенно после важных изменений. В ней находятся операции, цели, лимиты, регулярные платежи, долги и история финансового помощника.</p><div class="actions"><button class="primary" data-act="export">Скачать копию</button><button data-act="import">Восстановить из копии</button></div></div><div class="card"><h2>Установить на телефон</h2><p class="muted" style="margin:8px 0">Android: откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».</p><p class="muted" style="margin:8px 0">iPhone: откройте сайт в Safari, нажмите «Поделиться», затем «На экран Домой».</p><small>После установки приложение будет открываться отдельным окном. Доступность пункта зависит от браузера.</small></div><p class="note">Финансовые записи синхронизируются с аккаунтом и дополнительно сохраняются в локальном хранилище браузера. При работе без сети новые изменения останутся на этом устройстве до восстановления соединения. Регулярно скачивайте резервную копию. Файл резервной копии содержит личную финансовую информацию — храните его в безопасном месте и не передавайте посторонним.</p>`
};

function renderPanel(){
  $$('#tabs [data-tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===tab));
  $('#panel').innerHTML=PANELS[tab]();
  if(tab==='assistant'){renderFinanceReport();renderChat();}
  if(tab==='settings')renderCurrencyRates();
  if(tab==='goals')updateGoalPreview();
}

const FORMS={
  goal(d){const name=d.name.trim(),target=Math.round(Number(d.target)*100)/100,saved=Math.round(Number(d.saved||0)*100)/100,rate=d.rate===''?0:Number(d.rate),currency=d.currency||'RUB';if(!name||!Number.isFinite(target)||!(target>0))return'Укажите название и корректную сумму цели.';if(!Number.isFinite(saved)||saved<0)return'Сумма не может быть отрицательной.';if(!Number.isFinite(rate)||rate<0||rate>100)return'Ставка должна быть от 0 до 100% годовых.';const fx=currency==='RUB'?1:window.SaymoSaldoCurrency?.rubPerUnit(currency);if(!Number.isFinite(fx)||fx<=0)return'Курс выбранной валюты пока недоступен. Попробуйте позже.';const goal={id:uid(),name,target,saved,currency,date:d.date||'',kind:d.kind==='deposit'?'deposit':'standard',rate:d.kind==='deposit'?rate:0};S.goals.push(goal);if(saved>0)S.tx.push({id:uid(),created:Date.now(),type:'saving',amount:Math.round(saved*fx*100)/100,category:'Накопления',date:today(),comment:'Начальный остаток цели: '+name,goalId:goal.id,currency,originalAmount:saved,exchangeRate:fx});toast('Цель создана')},
  budget(d){const limit=Math.round(Number(d.limit));if(!Number.isFinite(limit)||!(limit>0))return'Укажите корректный лимит больше нуля.';const b=S.budgets.find(x=>x.category===d.category);if(b)b.limit=limit;else S.budgets.push({category:d.category,limit});toast('Лимит сохранён')},
  rec(d){const name=d.name.trim(),amount=Math.round(Number(d.amount)),day=Math.round(Number(d.day));if(!name||!Number.isFinite(amount)||!(amount>0))return'Укажите название и корректную сумму.';if(!(day>=1&&day<=31))return'День — от 1 до 31.';S.recurring.push({id:uid(),name,amount,category:d.category,day});toast('Платёж добавлен')},
  debt(d){const name=d.name.trim(),original=Math.round(Number(d.original)),remaining=Math.round(Number(d.remaining)),monthly=Math.round(Number(d.monthly)),day=Math.round(Number(d.day)),rate=d.rate===''?null:Number(d.rate);if(!name)return'Укажите название.';if(!Number.isFinite(original)||!(original>0))return'Первоначальная сумма должна быть больше нуля.';if(!Number.isFinite(remaining)||!(remaining>=0&&remaining<=original))return'Остаток должен быть от 0 до первоначальной суммы.';if(!Number.isFinite(monthly)||!(monthly>0))return'Укажите корректный ежемесячный платёж.';if(!(day>=1&&day<=31))return'День — от 1 до 31.';if(rate!==null&&!(rate>=0&&rate<=100))return'Ставка — от 0 до 100.';S.debts.push({id:uid(),kind:d.kind,name,original,remaining,monthly,day,rate,history:[]});toast('Обязательство добавлено')},
  chat(d){askAssistant(d.q)}
};

document.addEventListener('submit',e=>{
  
  const f=e.target.dataset.form;
  if(!f)return;
  e.preventDefault();
  const err=FORMS[f](Object.fromEntries(new FormData(e.target)));
  if(err)return toast(err);
  if(!save())return;
  e.target.reset();
  render();
});

function fillTx(){$('#txCat').innerHTML=catOpts(document.querySelector('#txForm [name=type]:checked').value);const sel=$('#txCurrency');if(sel&&window.SaymoSaldoCurrency)sel.innerHTML=window.SaymoSaldoCurrency.options().map(x=>`<option value="${x.code}">${esc(x.label)}</option>`).join('');updateCurrencyPreview()}
function updateCurrencyPreview(){const f=$('#txForm'),out=$('#txCurrencyPreview');if(!f||!out)return;const c=f.elements.currency?.value||'RUB',v=Number(f.elements.amount?.value||0),rate=window.SaymoSaldoCurrency?.rubPerUnit(c);out.textContent=!v?'':c==='RUB'?`${money(v)} — основная валюта`:Number.isFinite(rate)?`Примерно ${money(v*rate)} по текущему курсу`:'Курс загружается. Пока можно выбрать рубли.'}
$('#txForm').addEventListener('input',e=>{if(e.target.name==='amount'||e.target.name==='currency')updateCurrencyPreview()});
$('#txForm').addEventListener('change',e=>{if(e.target.name==='type')fillTx();if(e.target.name==='currency')updateCurrencyPreview()});
window.addEventListener('saymo-rates-updated',()=>{const sel=$('#txCurrency'),current=sel?.value;if(sel){sel.innerHTML=window.SaymoSaldoCurrency.options().map(x=>`<option value="${x.code}">${esc(x.label)}</option>`).join('');sel.value=current||'RUB';}updateCurrencyPreview();renderCurrencyRates();renderHomeCurrencyRates()});
$('#txForm').addEventListener('submit',e=>{
  e.preventDefault();
  
  const f=e.target,d=Object.fromEntries(new FormData(f));
  const originalAmount=Number(d.amount),currency=d.currency||'RUB',exchangeRate=currency==='RUB'?1:window.SaymoSaldoCurrency?.rubPerUnit(currency);
  if(!Number.isFinite(originalAmount)||!(originalAmount>0))return toast('Укажите корректную сумму больше нуля.');
  if(!Number.isFinite(exchangeRate)||!(exchangeRate>0))return toast('Курс этой валюты пока недоступен. Обновите курсы или выберите рубли.');
  if(!d.date)return toast('Укажите дату.');
  const amount=Math.round(originalAmount*exchangeRate*100)/100;
  S.tx.push({id:uid(),created:Date.now(),type:d.type,amount,originalAmount,currency,exchangeRate,category:d.category,date:d.date,comment:(d.comment||'').trim().slice(0,80)});
  if(!save())return;
  f.reset();
  fillTx();
  toast('Операция сохранена');
  go('home');
});

function goalProjection(g){const target=Number(g.target)||0,saved=Number(g.saved)||0,rate=(g.kind==='deposit'?Number(g.rate)||0:0)/1200;let months=0;if(g.date){const now=new Date(),due=new Date(g.date+'T12:00:00');months=Math.max(0,(due.getFullYear()-now.getFullYear())*12+due.getMonth()-now.getMonth());if(due>now)months=Math.max(1,months);}if(!months)return {months:0,monthly:0,interest:0,future:saved*(1+rate)};const factor=rate>0?(Math.pow(1+rate,months)-1)/rate:months;const futureSaved=saved*Math.pow(1+rate,months);const monthly=Math.max(0,(target-futureSaved)/Math.max(factor,1));const interest=Math.max(0,futureSaved-saved+monthly*(factor-months));return {months,monthly,interest,future:futureSaved+monthly*factor};}
function goalPreviewText(g){const p=goalProjection(g),c=g.currency||'RUB';if(!g.date)return g.kind==='deposit'&&g.rate?`Ориентировочный доход за месяц: ${currencyMoney((Number(g.saved)||0)*Number(g.rate)/1200,c)} при текущем остатке.`:'Укажите срок — приложение рассчитает необходимое ежемесячное пополнение.';if(!p.months)return Number(g.saved)>=Number(g.target)?'Цель уже достигнута.':'До выбранной даты меньше месяца — укажите более поздний срок.';return `До срока: ${p.months} мес. Нужно откладывать примерно ${currencyMoney(p.monthly,c)} в месяц.${g.kind==='deposit'?` Прогноз процентов за период — ${currencyMoney(p.interest,c)} при ставке ${Number(g.rate)||0}% годовых и ежемесячной капитализации.`:''}`;}
function updateGoalPreview(){const f=document.querySelector('form[data-form="goal"]'),el=$('#goalPreview');if(!f||!el)return;const d=Object.fromEntries(new FormData(f));el.textContent=goalPreviewText({target:Number(d.target)||0,saved:Number(d.saved)||0,date:d.date||'',kind:d.kind==='deposit'?'deposit':'standard',rate:Number(d.rate)||0});}
document.addEventListener('input',e=>{if(e.target.closest('form[data-form="goal"]'))updateGoalPreview()});
document.addEventListener('change',e=>{if(e.target.closest('form[data-form="goal"]'))updateGoalPreview()});
function renderCurrencyRates(){const el=$('#currencyRates');if(!el||!window.SaymoSaldoCurrency)return;const snap=window.SaymoSaldoCurrency.snapshot();if(!snap){el.innerHTML='<small>Курсы пока не загружены. Проверьте соединение и нажмите «Обновить курсы».</small>';return;}const codes=['USD','EUR','CNY'];el.innerHTML=codes.map(code=>{const rate=window.SaymoSaldoCurrency.rubPerUnit(code);return Number.isFinite(rate)?`<div class="item"><b>1 ${code}</b><b>${money(rate)}</b></div>`:''}).join('')||'<small>Курсы недоступны.</small>';const stamp=new Date(snap.updatedAt);el.insertAdjacentHTML('beforeend',`<small>Обновлено: ${stamp.toLocaleString('ru-RU')} · <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates By Exchange Rate API</a></small>`);}
function renderHomeCurrencyRates(){const el=$('#homeCurrencyRates'),stampEl=$('#homeCurrencyUpdated');if(!el||!window.SaymoSaldoCurrency)return;const snap=window.SaymoSaldoCurrency.snapshot();if(!snap){el.innerHTML='<small class="muted">Курсы пока недоступны. Откройте «Все курсы» и попробуйте обновить.</small>';if(stampEl)stampEl.textContent='';return;}const codes=['USD','EUR','CNY'];el.innerHTML=codes.map(code=>{const rate=window.SaymoSaldoCurrency.rubPerUnit(code);return Number.isFinite(rate)?`<div class="item"><b>1 ${code}</b><b>${money(rate)}</b></div>`:''}).join('');if(stampEl)stampEl.textContent='Обновлено: '+new Date(snap.updatedAt).toLocaleString('ru-RU');}
function payRecurring(id){
  const r=S.recurring.find(x=>x.id===id);if(!r)return;
  const key=scopedKey('paid_'+nowMk()+'_'+id);
  try{if(localStorage.getItem(key))return toast('Этот платёж уже отмечен в этом месяце')}catch(e){}
  const dt=new Date(),last=new Date(dt.getFullYear(),dt.getMonth()+1,0).getDate();
  const date=nowMk()+'-'+String(Math.min(r.day,last)).padStart(2,'0');
  if(S.tx.some(x=>x.recurringId===id&&x.date===date)){
    try{localStorage.setItem(key,'1')}catch(e){}
    return toast('Этот платёж уже есть в истории за месяц');
  }
  S.tx.push({id:uid(),created:Date.now(),type:'expense',amount:r.amount,category:r.category,date,comment:r.name,recurringId:id});
  if(!save())return;
  try{localStorage.setItem(key,'1')}catch(e){}
  toast('Расход добавлен в историю');render();
}

function payDebt(id){
  const d=S.debts.find(x=>x.id===id);if(!d)return;
  const dlg=$('#dlg');
  dlg.innerHTML=`<form class="dlgf"><h2>Платёж по обязательству</h2>
    ${field('paid','Сколько заплатили, ₽','number',`value="${esc(d.monthly)}" required min="1" step="1"`)}
    ${field('principal','На сколько уменьшился основной долг, ₽','number','min="0" step="1" placeholder="По умолчанию — вся сумма платежа"')}
    <p class="muted" style="margin:0 0 12px">Если оставить второе поле пустым, остаток долга уменьшится на всю сумму платежа. Если часть ушла на проценты или комиссию, укажите только сумму, которая погасила основной долг.</p>
    <p class="err" id="dlgErr"></p><div class="row end"><button type="button" data-act="dlg-cancel">Отмена</button><button class="primary">Записать платёж</button></div></form>`;
  dlg.querySelector('form').addEventListener('submit',e=>{
    e.preventDefault();
    const f=Object.fromEntries(new FormData(e.target));
    const paid=Math.round(Number(f.paid));
    const principal=f.principal.trim()===''?paid:Math.round(Number(f.principal));
    const err=$('#dlgErr');
    if(!Number.isFinite(paid)||paid<=0){err.textContent='Укажите сумму платежа больше нуля.';return}
    if(!Number.isFinite(principal)||principal<0||principal>paid){err.textContent='Сумма погашения основного долга должна быть от 0 до суммы платежа.';return}
    if(principal>d.remaining){err.textContent='Сумма погашения больше остатка долга.';return}
    const date=today();
    S.tx.push({id:uid(),created:Date.now(),type:'expense',amount:paid,category:'Кредиты и долги',date,comment:'Платёж: '+d.name});
    d.remaining-=principal;
    d.history=[...(d.history||[]),{date,amount:paid,principal}];
    if(!save())return;render();dlg.close();
    toast(d.remaining===0?'Обязательство полностью погашено':'Платёж записан. Остаток долга обновлён.');
  });
  dlg.showModal();
}
function exportData(){
  const data={app:'SaymoSaldo',version:6,exportedAt:new Date().toISOString(),...S};
  try{data.chatFinance=JSON.parse(localStorage.getItem(chatKey())||'[]')}catch{data.chatFinance=[]}
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`SaymoSaldo-backup-${today()}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function validBackupDate(v){
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
  const [y,m,d]=v.split('-').map(Number),dt=new Date(y,m-1,d);
  return dt.getFullYear()===y&&dt.getMonth()===m-1&&dt.getDate()===d;
}
function validBackup(d){
  if(!d||typeof d!=='object'||d.app!=='SaymoSaldo')return false;
  const arrays=['tx','goals','budgets','recurring'];
  if(!arrays.every(k=>Array.isArray(d[k])&&d[k].length<=20000))return false;
  if('debts'in d&&(!Array.isArray(d.debts)||d.debts.length>5000))return false;
  if('chatFinance'in d&&(!Array.isArray(d.chatFinance)||d.chatFinance.length>60))return false;
  const str=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
  const ident=v=>(typeof v==='string'&&v.length>0&&v.length<=100)||(Number.isSafeInteger(v)&&v>0);
  const positive=v=>Number.isSafeInteger(Number(v))&&Number(v)>0;
  const nonnegative=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0;
  if(d.tx.some(x=>!x||typeof x!=='object'||!ident(x.id)||!['income','expense','saving'].includes(x.type)||!Number.isFinite(Number(x.amount))||Number(x.amount)<=0||Number(x.amount)>Number.MAX_SAFE_INTEGER||!str(x.category,80)||!validBackupDate(x.date)||('comment'in x&&typeof x.comment!=='string')||('comment'in x&&x.comment.length>200)||('currency'in x&&(!/^[A-Z]{3}$/.test(x.currency)||!Number.isFinite(Number(x.originalAmount))||Number(x.originalAmount)<=0||!Number.isFinite(Number(x.exchangeRate))||Number(x.exchangeRate)<=0))))return false;
  if(d.goals.some(x=>!x||typeof x!=='object'||!ident(x.id)||!str(x.name,1000)||!positive(x.target)||!nonnegative(x.saved)||('date'in x&&x.date!==''&&!validBackupDate(x.date))||('kind'in x&&!['standard','deposit'].includes(x.kind))||('rate'in x&&(!Number.isFinite(Number(x.rate))||Number(x.rate)<0||Number(x.rate)>100))))return false;
  if(d.budgets.some(x=>!x||typeof x!=='object'||!str(x.category,80)||!positive(x.limit)))return false;
  if(d.recurring.some(x=>!x||typeof x!=='object'||!ident(x.id)||!str(x.name,1000)||!positive(x.amount)||!str(x.category,80)||!Number.isInteger(Number(x.day))||Number(x.day)<1||Number(x.day)>31))return false;
  if((d.debts||[]).some(x=>!x||typeof x!=='object'||!ident(x.id)||!str(x.name,1000)||!str(x.kind,60)||!positive(x.original)||!nonnegative(x.remaining)||Number(x.remaining)>Number(x.original)||!positive(x.monthly)||!Number.isInteger(Number(x.day))||Number(x.day)<1||Number(x.day)>31||('rate'in x&&x.rate!==null&&(!Number.isFinite(Number(x.rate))||Number(x.rate)<0||Number(x.rate)>100))||('history'in x&&(!Array.isArray(x.history)||x.history.length>20000||x.history.some(p=>!p||!validBackupDate(p.date)||!positive(p.amount)||!nonnegative(p.principal)||Number(p.principal)>Number(p.amount))))))return false;
  if((d.chatFinance||[]).some(x=>!x||typeof x!=='object'||!['user','assistant'].includes(x.role)||typeof x.text!=='string'||x.text.length>100000))return false;
  return true;
}
function importData(e){
  const f=e.target.files[0];e.target.value='';if(!f)return;
  if(f.size>10*1024*1024)return toast('Файл слишком большой для восстановления (максимум 10 МБ).');
  const r=new FileReader();
  r.onload=()=>{
    let d;try{d=JSON.parse(r.result)}catch{return toast('Файл повреждён или не является JSON')}
    if(!validBackup(d))return toast('Резервная копия повреждена или содержит некорректные данные. Текущие записи не изменены.');
    if(!confirm('Заменить текущие финансовые данные данными из копии? Перед восстановлением сохраните текущую копию, если хотите иметь возможность отменить замену.'))return;
    const previousState={tx:S.tx,goals:S.goals,budgets:S.budgets,recurring:S.recurring,debts:S.debts};
    const nextState={tx:d.tx,goals:d.goals,budgets:d.budgets,recurring:d.recurring,debts:Array.isArray(d.debts)?d.debts:[]};
    Object.assign(S,nextState);
    const entries=Object.fromEntries(KEYS.map(k=>[scopedKey(k),JSON.stringify(S[k])]));
    if(Array.isArray(d.chatFinance))entries[chatKey()]=JSON.stringify(d.chatFinance);
    entries[scopedKey('local_modified_at')]=new Date().toISOString();
    entries[scopedKey('pending_sync')]='1';
    if(!persistEntries(entries)){Object.assign(S,previousState);return}
    if(cloudSaveHandler)cloudSaveHandler();
    render();renderPanel();toast('Данные восстановлены.');
  };
  r.onerror=()=>toast('Не удалось прочитать файл резервной копии');
  r.readAsText(f);
}


const chatKey=()=>KEY+'chat_'+mode;
function loadChatItems(){try{return JSON.parse(localStorage.getItem(chatKey()))||[]}catch{return[]}}
function renderChat(){
  const el=$('#chat');if(!el)return;
  const list=loadChatItems();
  el.innerHTML=list.map(m=>`<div class="msg ${m.role==='user'?'user':''}">${esc(m.text)}</div>`).join('')||empty('Спросите, например, на что уходит больше всего денег.');
  el.scrollTop=el.scrollHeight;
}
function askAssistant(q){
  q=(q||'').trim();if(!q)return;
  const list=loadChatItems();
  list.push({role:'user',text:q},{role:'assistant',text:finance(q)});
  const chatEntries={[chatKey()]:JSON.stringify(list.slice(-60)),[scopedKey('local_modified_at')]:new Date().toISOString(),[scopedKey('pending_sync')]:'1'};
  if(!persistEntries(chatEntries))return toast('Не удалось сохранить историю помощника. Освободите место в браузере и попробуйте снова.')
  if(cloudSaveHandler)cloudSaveHandler();
  renderChat();
}

function financeReportData(){
  const key=nowMk(), current=monthTx(key), expenses=current.filter(x=>x.type==='expense'&&Number(x.amount)>0), incomes=current.filter(x=>x.type==='income'&&Number(x.amount)>0);
  const by={};expenses.forEach(x=>{const c=String(x.category||'Другое');by[c]=(by[c]||0)+Number(x.amount||0)});
  const top=Object.entries(by).sort((a,b)=>b[1]-a[1]), spent=total(expenses.map(x=>x.amount)), earned=total(incomes.map(x=>x.amount));
  const now=new Date(),day=now.getDate(),days=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const prevDate=new Date(now.getFullYear(),now.getMonth()-1,1),prevKey=ymd(prevDate).slice(0,7),prevDay=Math.min(day,new Date(prevDate.getFullYear(),prevDate.getMonth()+1,0).getDate());
  const prevRows=monthTx(prevKey).filter(x=>Number(String(x.date).slice(8,10))<=prevDay),prevSpent=sumType(prevRows,'expense');
  const budgets=S.budgets.map(b=>({category:b.category,limit:Number(b.limit)||0,spent:by[b.category]||0})).filter(b=>b.limit>0).sort((a,b)=>b.spent/b.limit-a.spent/a.limit);
  const recurring=total(S.recurring.map(x=>x.amount))+total(S.debts.filter(x=>Number(x.remaining)>0).map(x=>x.monthly));
  const goals=S.goals.map(g=>({name:g.name,target:Number(g.target)||0,saved:Number(g.saved)||0,date:g.date||''}));
  return {key,current,expenses,incomes,by,top,spent,earned,day,days,prevKey,prevDay,prevSpent,budgets,recurring,goals,forecast:spent/day*days};
}
function renderFinanceReport(){
  const el=$('#assistantReport');if(!el)return;
  const d=financeReportData(),alerts=d.budgets.filter(b=>b.spent>=b.limit*.8),net=d.earned-d.spent;
  const advice=alerts.length?alerts.map(b=>`«${esc(b.category)}»: использовано ${Math.round(b.spent/b.limit*100)}% лимита`).join('; ')
    :d.top.length?`Основная статья расходов — «${esc(d.top[0][0])}» (${money(d.top[0][1])}). Проверьте, можно ли установить для неё комфортный лимит.`
    :'Добавьте несколько расходов, чтобы получить первые рекомендации.';
  el.innerHTML=`<div class="card forecast-card"><div class="forecast-head"><b>Ваш финансовый обзор</b><span class="forecast-tag">${esc(monthName(d.key))}</span></div>
    <div class="forecast-grid"><div class="forecast-metric"><span>Доходы</span><b>${money(d.earned)}</b></div><div class="forecast-metric"><span>Расходы</span><b>${money(d.spent)}</b></div><div class="forecast-metric"><span>Разница</span><b class="${net>=0?'pos':''}">${money(net)}</b></div><div class="forecast-metric"><span>Прогноз расходов</span><b>${d.day>=5&&d.expenses.length>=3?money(d.forecast):'Пока рано'}</b></div></div>
    ${d.top.length?`<div class="insight-line"><b>Самая затратная категория</b><br>${esc(d.top[0][0])} — ${money(d.top[0][1])} (${Math.round(d.top[0][1]/Math.max(1,d.spent)*100)}% расходов)</div>`:''}
    ${d.prevSpent>0?`<p class="forecast-note">За первые ${d.prevDay} дней прошлого месяца расходы составили ${money(d.prevSpent)}. Сейчас: ${money(d.spent)}. Сравнение по одинаковому числу дней.</p>`:''}
    <div class="insight-line"><b>Что стоит проверить</b><br>${advice}</div>
    <p class="forecast-note">Расчёт по внесённым операциям, не по банковским данным. Это не финансовая рекомендация.</p></div>
    <div class="card" style="margin-top:10px"><div class="row"><b>Регулярные платежи и долги</b><b>${money(d.recurring)} / мес.</b></div><small class="muted">По введённым вами регулярным платежам и ежемесячным платежам по долгам.</small></div>
    ${d.goals.length?`<div class="card" style="margin-top:10px"><b>Накопительные цели</b>${d.goals.map(g=>`<div style="margin-top:10px"><div class="row"><span>${esc(g.name)}</span><b>${money(g.saved)} / ${money(g.target)}</b></div><div class="bar"><i style="width:${g.target?Math.min(100,g.saved/g.target*100):0}%"></i></div></div>`).join('')}</div>`:''}`;
}
function finance(q){
  const d=financeReportData(),s=String(q||'').toLowerCase();
  if(!S.tx.length)return'Пока нет операций. Добавьте доходы и расходы — тогда я смогу показать аналитику.';
  if(/цель|накоп/.test(s))return d.goals.length?'Ваши цели: '+d.goals.map(g=>`«${g.name}» — ${money(g.saved)} из ${money(g.target)} (${g.target?Math.round(g.saved/g.target*100):0}%).`).join(' '):'Вы пока не создали накопительные цели. Добавьте цель в разделе «Бюджет».';
  if(/платеж|подпис|регуляр|долг|кредит/.test(s))return d.recurring?`По вашим записям регулярные платежи и ежемесячные платежи по долгам составляют примерно ${money(d.recurring)} в месяц. Проверьте, все ли записи актуальны.`:'Вы пока не добавили регулярные платежи или долги.';
  if(/доход|заработ|отлож|сбереж/.test(s))return d.earned?`В этом месяце внесено доходов на ${money(d.earned)} и расходов на ${money(d.spent)}. Разница — ${money(d.earned-d.spent)}. Это сумма по записанным операциям, а не гарантированно свободные деньги.`:'В этом месяце пока нет записанных доходов.';
  if(/трач|категор|больше/.test(s))return d.top.length?`Больше всего в этом месяце уходит на «${d.top[0][0]}»: ${money(d.top[0][1])} (${Math.round(d.top[0][1]/Math.max(1,d.spent)*100)}% расходов).`:'В этом месяце расходов пока нет.';
  if(/изменил|сравн|прошл|динамик/.test(s))return d.prevSpent?`За первые ${d.prevDay} дней прошлого месяца расходы были ${money(d.prevSpent)}, за первые ${d.day} дней этого — ${money(d.spent)}. ${d.spent>d.prevSpent?'Сейчас потрачено больше.':'Сейчас потрачено меньше или столько же.'}`:`В этом месяце расходы составили ${money(d.spent)}. Данных за соответствующий период прошлого месяца пока нет.`;
  if(/лимит|превыш|угроз/.test(s)){const hit=d.budgets.filter(b=>b.spent>=b.limit*.8);return hit.length?'Обратите внимание на лимиты: '+hit.map(b=>`«${b.category}» — ${Math.round(b.spent/b.limit*100)}% (${money(b.spent)} из ${money(b.limit)})`).join('; ')+'.':'Пока ни один лимит не достиг 80%. Продолжайте следить за расходами.'}
  if(/совет|эконом|сократ/.test(s)){if(d.budgets.some(b=>b.spent>b.limit))return'Сначала стоит остановить рост расходов в категориях, где уже превышен лимит: '+d.budgets.filter(b=>b.spent>b.limit).map(b=>b.category).join(', ')+'. Пересмотрите ближайшие необязательные покупки.';return d.top.length?`Начните с категории «${d.top[0][0]}» — сейчас это ${money(d.top[0][1])}. Посмотрите последние операции и выберите одну небольшую регулярную трату, которую комфортно сократить. Не урезайте необходимые расходы.`:'Добавьте расходы, и я смогу предложить конкретные способы экономии.'}
  return'Я могу проанализировать расходы по категориям, сравнить месяцы, проверить лимиты, оценить регулярные платежи и показать прогресс накопительных целей. Попробуйте одну из подсказок выше.';
}


const TOUR=[
 {view:'home',sel:'#balance',t:'Главная',x:'Здесь видно баланс месяца, доходы и расходы. Всё обновляется сразу после записи операции.'},
 {view:'home',sel:'nav button[data-go="add"]',t:'Новая операция',x:'Нажмите «Добавить», чтобы записать трату или доход. Укажите сумму и категорию, дата подставится сама.'},
 {view:'ops',sel:'#allItems',t:'Операции',x:'Здесь все записи. Фильтр покажет только расходы или только доходы, а лишнюю операцию можно удалить.'},
 {view:'stats',sel:'#budgetWrap',t:'Бюджет',x:'Цели накопления и лимиты по категориям. Лимит подскажет, когда категория близка к пределу.'},
 {view:'more',tab:'recurring',sel:'#panel',t:'Платежи',x:'Аренда, интернет, подписки. Отмечайте оплату, и расход сразу появится в истории.'},
 {view:'more',tab:'debts',sel:'#panel',t:'Задолженность',x:'Кредиты и другие обязательства: видно остаток и процент погашения. Каждый платёж помогает отслеживать, как уменьшается задолженность.'},
 {view:'more',tab:'data',sel:'#panel',t:'Данные и резервная копия',x:'Сохраняйте резервную копию в разделе «Данные». Восстановить записи можно из ранее сохранённого файла.'}
];
let tourI=0;
function showWelcome(){
  const d=document.createElement('div');d.id='welcome';d.className='overlay';
  d.innerHTML='<div class="ov-card"><div style="font-size:34px;margin-bottom:12px">✦</div><h2>Добро пожаловать в SaymoSaldo!</h2><p class="muted">Здесь можно записывать доходы и расходы, планировать бюджет, контролировать регулярные платежи и долги, а также создавать цели накоплений и смотреть финансовую статистику.</p><p class="muted">Основная валюта — рубль; операции в других валютах автоматически пересчитываются по курсу. Накопительные цели показывают прогноз процентов.</p><p class="muted">Сначала коротко покажем основные разделы и объясним, как правильно вносить данные. Обучение можно повторно открыть позже в разделе «Ещё → Настройки».</p><div style="display:grid;gap:8px"><button class="primary" data-act="welcome-yes">Начать обучение</button><button class="ghost" data-act="welcome-no">Перейти к приложению</button></div></div>';
  document.body.appendChild(d);
}
function closeWelcome(){document.getElementById('welcome')?.remove()}
function startTour(){closeWelcome();tourI=0;showTourStep()}
function showTourStep(){
  document.querySelectorAll('.tour-hl').forEach(e=>e.classList.remove('tour-hl'));
  const st=TOUR[tourI]; if(st.tab)tab=st.tab;
  go(st.view);
  const el=document.querySelector(st.sel);
  if(el){el.classList.add('tour-hl');el.scrollIntoView({block:'center'})}
  let c=document.getElementById('tour');
  if(!c){c=document.createElement('div');c.id='tour';c.className='tour-card';document.body.appendChild(c)}
  const last=tourI===TOUR.length-1;
  c.innerHTML=`<small class="muted">Шаг ${tourI+1} из ${TOUR.length}</small><h2 style="font-size:17px;margin:4px 0 6px">${st.t}</h2><p style="margin-bottom:14px">${st.x}</p><div class="row"><button class="link" data-act="tour-skip">Пропустить</button><div style="display:flex;gap:8px">${tourI>0?'<button class="ghost" data-act="tour-back">Назад</button>':''}<button class="primary" data-act="tour-next" style="width:auto">${last?'Готово':'Дальше'}</button></div></div>`;
}
function endTour(state){
  try{localStorage.setItem(KEY+'onboarding',state)}catch(e){}
  document.querySelectorAll('.tour-hl').forEach(e=>e.classList.remove('tour-hl'));
  document.getElementById('tour')?.remove();
}
function setTheme(v){try{localStorage.setItem('saymosaldo_theme',v)}catch(e){}if(v==='light'||v==='dark')document.documentElement.dataset.theme=v;else delete document.documentElement.dataset.theme}
document.addEventListener('click',e=>{
  
  const t=e.target.closest('[data-go],[data-tab],[data-mode],[data-q],[data-act],[data-theme-set]');
  if(!t)return;
  if(t.dataset.themeSet){setTheme(t.dataset.themeSet);return renderPanel()}
  if(t.dataset.go){if(t.dataset.tabTarget)tab=t.dataset.tabTarget;return go(t.dataset.go)}
  if(t.dataset.tab){tab=t.dataset.tab;return renderPanel()}
  if(t.dataset.mode){mode=t.dataset.mode;return renderPanel()}
  if(t.dataset.q)return askAssistant(t.dataset.q);
  const id=t.dataset.id,act=t.dataset.act;
  const confirmDo=(msg,fn)=>{if(confirm(msg)){fn();if(!save())return;render()}};
  switch(act){
    case'tx-del':return confirmDo('Удалить операцию?',()=>{const tx=S.tx.find(x=>String(x.id)===id);if(tx?.type==='saving'&&tx.goalId){const goal=S.goals.find(g=>String(g.id)===String(tx.goalId));if(goal)goal.saved=Math.max(0,(Number(goal.saved)||0)-(Number(tx.amount)||0));}S.tx=S.tx.filter(x=>String(x.id)!==id)});
    case'goal-edit':return editGoal(id);
    case'goal-fund':return ask('Пополнить цель',[{n:'amount',l:'Сумма, ₽'}],f=>{
      const v=Math.round(+f.amount),g=S.goals.find(x=>x.id===id);
      if(!g)return'Цель не найдена.';
      if(!Number.isSafeInteger(v)||!(v>0))return'Введите корректную сумму больше нуля.';
      g.saved+=v;S.tx.push({id:uid(),created:Date.now(),type:'saving',amount:v,category:'Накопления',date:today(),comment:'Пополнение цели: '+g.name,goalId:g.id,currency:'RUB',originalAmount:v,exchangeRate:1});if(!save())return;render();toast('Пополнение записано в операции');
    });
    case'goal-del':return confirmDo('Удалить цель?',()=>{S.goals=S.goals.filter(x=>x.id!==id)});
    case'budget-del':return confirmDo('Удалить лимит?',()=>{S.budgets=S.budgets.filter(x=>x.category!==t.dataset.cat)});
    case'rec-pay':return payRecurring(id);
    case'rec-del':return confirmDo('Удалить регулярный платёж?',()=>{S.recurring=S.recurring.filter(x=>x.id!==id)});
    case'debt-pay':return payDebt(id);
    case'debt-del':return confirmDo('Удалить обязательство? История расходов останется.',()=>{S.debts=S.debts.filter(x=>x.id!==id)});
    case'chat-clear':if(confirm('Очистить историю этого режима на этом устройстве?')){const entries={[chatKey()]:JSON.stringify([]),[scopedKey('local_modified_at')]:new Date().toISOString(),[scopedKey('pending_sync')]:'1'};if(!persistEntries(entries))return toast('Не удалось очистить историю. Попробуйте ещё раз.');if(cloudSaveHandler)cloudSaveHandler();renderChat()}return;
    case'welcome-yes':return startTour();
    case'welcome-no':try{localStorage.setItem(KEY+'onboarding','skipped')}catch(e){}closeWelcome();return;
    case'tour-start':return startTour();
    case'tour-next':if(tourI<TOUR.length-1){tourI++;return showTourStep()}return endTour('done');
    case'tour-back':tourI--;return showTourStep();
    case'tour-skip':return endTour('skipped');
    case'currency-refresh':return window.SaymoSaldoCurrency?.refresh().then(()=>{renderCurrencyRates();updateCurrencyPreview();toast('Курсы обновлены')}).catch(()=>toast('Не удалось обновить курсы. Попробуйте позже.'));
    case'export':return exportData();
    case'import':return $('#importFile').click();
    case'dlg-cancel':return $('#dlg').close();
  }
});

document.addEventListener('change',e=>{if(e.target.id==='importFile')importData(e)});
$('#filter').addEventListener('change',render);

function readStoredArray(key){try{const value=JSON.parse(localStorage.getItem(key));return Array.isArray(value)?value:[]}catch(e){return[]}}
window.SaymoSaldoApp={
 getGuestData(){if(localStorage.getItem('saymosaldo_guest_migration_handled')==='1')return {tx:[],goals:[],budgets:[],recurring:[],debts:[],chat_finance:[]};return {tx:S.tx,goals:S.goals,budgets:S.budgets,recurring:S.recurring,debts:S.debts,chat_finance:readStoredArray('saymosaldo_chat_finance')}},
 getLocalUserData(userId){const prefix='saymosaldo_user_'+userId+'_';let found=false;const data={};for(const key of KEYS){const raw=localStorage.getItem(prefix+key);if(raw!==null)found=true;try{const value=JSON.parse(raw);data[key]=Array.isArray(value)?value:[]}catch(e){data[key]=[]}}const chatRaw=localStorage.getItem(prefix+'chat_finance');if(chatRaw!==null)found=true;try{const value=JSON.parse(chatRaw);data.chat_finance=Array.isArray(value)?value:[]}catch(e){data.chat_finance=[]}if(!found)return null;return {data,updated_at:localStorage.getItem(prefix+'local_modified_at')||'1970-01-01T00:00:00.000Z',pending_sync:localStorage.getItem(prefix+'pending_sync')==='1'}},
 getData(){return {tx:S.tx,goals:S.goals,budgets:S.budgets,recurring:S.recurring,debts:S.debts,chat_finance:readStoredArray(chatKey())}},
 activate(userId,data,updatedAt,pendingSync){const oldKey=KEY,previous={tx:S.tx,goals:S.goals,budgets:S.budgets,recurring:S.recurring,debts:S.debts};KEY='saymosaldo_user_'+userId+'_';S.tx=Array.isArray(data.tx)?data.tx:[];S.goals=Array.isArray(data.goals)?data.goals:[];S.budgets=Array.isArray(data.budgets)?data.budgets:[];S.recurring=Array.isArray(data.recurring)?data.recurring:[];S.debts=Array.isArray(data.debts)?data.debts:[];const entries=Object.fromEntries(KEYS.map(key=>[scopedKey(key),JSON.stringify(S[key])]));entries[chatKey()]=JSON.stringify(Array.isArray(data.chat_finance)?data.chat_finance:Array.isArray(data.chatFinance)?data.chatFinance:[]);entries[scopedKey('local_modified_at')]=updatedAt||new Date().toISOString();entries[scopedKey('pending_sync')]=pendingSync?'1':'0';if(!persistEntries(entries)){KEY=oldKey;Object.assign(S,previous);return false}try{localStorage.setItem('saymosaldo_guest_migration_handled','1')}catch(e){}fillTx();go('home');renderPanel();$('#appShell').hidden=false;if(!localStorage.getItem(KEY+'onboarding'))showWelcome();return true},
 setCloudSaveHandler(handler){cloudSaveHandler=typeof handler==='function'?handler:null},
 markSynced(){try{localStorage.setItem(scopedKey('pending_sync'),'0')}catch(e){}},
 hasPendingSync(){try{return localStorage.getItem(scopedKey('pending_sync'))==='1'}catch(e){return false}},
 getLocalModifiedAt(){try{return localStorage.getItem(scopedKey('local_modified_at'))||''}catch(e){return''}},
 setSyncStatus(message){const el=$('#syncStatus');if(el)el.textContent=message||''},
 reset(){cloudSaveHandler=null;KEY='saymosaldo_';S.tx=[];S.goals=[];S.budgets=[];S.recurring=[];S.debts=[];$('#appShell').hidden=true}
};
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
