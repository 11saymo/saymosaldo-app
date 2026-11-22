(()=>{'use strict';
const HELP={
 'txForm':{amount:'Введите фактическую сумму в рублях числом, без знака ₽. Например: 450. Сумма должна быть больше нуля.',category:'Выберите, к чему относится операция. Для доходов и расходов список разный. Если подходящего варианта нет, выберите «Другое».',date:'Укажите день, когда деньги поступили или были потрачены. Можно выбрать прошлую дату — месяц учёта определится автоматически.',comment:'Коротко поясните операцию, чтобы позже узнать её в истории: «обед», «аванс», «аптека». До 80 символов.'},
 'authLoginForm':{username:'Введите логин, который указали при регистрации. Для старого аккаунта подойдёт прежний email.',password:'Введите пароль от этого аккаунта. Учитываются заглавные и строчные буквы.'},
 'authRegisterForm':{username:'Только латинские буквы, цифры, точка, дефис или подчёркивание. От 3 до 24 символов. Начните с буквы или цифры.',password:'Уникальный пароль длиной не менее 12 символов. Не используйте пароль от других сайтов.',passwordConfirm:'Введите тот же пароль ещё раз. Проверьте раскладку клавиатуры, регистр и пробелы.'},
 'authResetForm':{username:'Введите логин аккаунта, пароль которого хотите восстановить.',recoveryCode:'Вставьте полный код из 48 символов, выданный при регистрации. Не добавляйте пробелы и никому не передавайте его.',password:'Создайте новый уникальный пароль длиной не менее 12 символов.',passwordConfirm:'Повторите новый пароль без изменений.'},
 'goal':{name:'Короткое название цели, например «Отпуск» или «Новый телефон».',target:'Общая сумма, которую хотите накопить. Укажите число больше нуля, без знака ₽.',saved:'Сколько уже реально накоплено на эту цель. Если пока ничего не отложили, укажите 0.',date:'Плановая дата достижения цели. Если срока пока нет, оставьте поле пустым.'},
 'budget':{category:'Выберите статью расходов, за которой хотите следить. Лимит считается за календарный месяц.',limit:'Максимальная сумма расходов по этой категории за месяц. Например, 15 000 ₽ на продукты.'},
 'rec':{name:'Название повторяющегося платежа, например «Домашний интернет» или «Аренда».',amount:'Сумма одного обычного платежа в рублях, без знака ₽.',category:'Выберите, к какой статье расходов относится платёж.',day:'Введите число месяца от 1 до 31, когда обычно платите. Например, 5 — пятое число.'},
 'debt':{kind:'Выберите вид обязательства: ипотека, кредит, кредитная карта, рассрочка или частный долг.',name:'Название, по которому узнаете долг, например «Ипотека — банк».',original:'Сколько вы заняли изначально. Не вычитайте уже внесённые платежи.',remaining:'Сколько осталось выплатить сегодня. Остаток не может быть больше первоначальной суммы. Если долг закрыт, укажите 0.',monthly:'Сумма обычного ежемесячного платежа по графику. Это плановое значение, автоматического списания нет.',day:'Число месяца, когда обычно нужно внести платёж: от 1 до 31.',rate:'Годовая ставка в процентах. Например, для 12,5% введите 12.5 без знака %. Если не знаете — оставьте пустым.'}
};
const INTRO={
 txForm:'Доход — деньги, которые вы получили. Расход — деньги, которые вы потратили. Выберите тип записи, затем заполните сумму, категорию и дату.',
 goal:'Цель — сумма, которую хотите накопить. «Уже отложено» — сколько реально накоплено сейчас, а не будущий план. Срок можно не указывать.',
 budget:'Лимит — ваш плановый максимум расходов по выбранной категории за календарный месяц. Он не блокирует покупки, а показывает потраченную и оставшуюся сумму.',
 rec:'Регулярный платёж — повторяющийся расход: аренда, интернет, подписка. День — число месяца, когда обычно платите. Это плановая запись, автоматического списания нет.',
 debt:'Первоначальная сумма — сколько заняли изначально. Текущий остаток — сколько должны сегодня. Ежемесячный платёж — сумма по графику. Ставку укажите без знака %, например 12.5 для 12,5% годовых.'
};
const style=document.createElement('style');
style.textContent='.field-help{display:block;color:var(--mut);font-size:12px;line-height:1.45;margin-top:0;overflow-wrap:anywhere}.form-intro{font-size:13px;line-height:1.55;color:var(--mut);background:color-mix(in srgb,var(--acc) 6%,var(--card));border:1px solid var(--line);border-radius:12px;padding:12px;margin:0 0 14px}';
(document.head||document.documentElement).appendChild(style);
function enhance(){
 document.querySelectorAll('form').forEach(form=>{
  const key=form.id||form.dataset.form;
  const map=HELP[key];if(!map)return;
  form.querySelectorAll('label.field').forEach(label=>{
   if(label.dataset.helpAdded)return;
   const input=label.querySelector('input,select,textarea');if(!input)return;
   const hint=map[input.name];if(!hint)return;
   const small=document.createElement('small');small.className='field-help';small.textContent=hint;label.appendChild(small);label.dataset.helpAdded='1';
  });
  if(INTRO[key]&&!form.dataset.introAdded){
   const p=document.createElement('p');p.className='form-intro';p.textContent=INTRO[key];
   const anchor=form.querySelector('.seg')||form.querySelector('button[type=submit],button.primary')||form.firstElementChild;
   if(anchor)form.insertBefore(p,anchor);else form.appendChild(p);
   form.dataset.introAdded='1';
  }
 });
 const dlg=document.querySelector('#dlg');
 if(dlg&&!dlg.dataset.paymentHelpAdded&&dlg.textContent.includes('Платёж по обязательству')){
  const p=document.createElement('p');p.className='form-intro';p.textContent='В первом поле укажите всю сумму, которую фактически заплатили. Во втором — только ту часть, на которую уменьшился основной долг. Например: заплатили 12 000 ₽, из них 9 000 ₽ погасили долг, 3 000 ₽ ушли на проценты: введите 12000 и 9000. Если не знаете разбивку, оставьте второе поле пустым — приложение вычтет всю сумму платежа.';
  const form=dlg.querySelector('form');const submit=form&&form.querySelector('button.primary');if(form&&submit)form.insertBefore(p,submit);dlg.dataset.paymentHelpAdded='1';
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else enhance();
new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
})();