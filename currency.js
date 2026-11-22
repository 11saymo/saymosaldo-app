(function(){
  'use strict';
  const KEY='saymosaldo_fx_rub_v1';
  const FALLBACK=['RUB','USD','EUR','CNY'];
  let data=null;
  try{const cached=JSON.parse(localStorage.getItem(KEY)||'null');if(cached&&cached.rates&&cached.updatedAt)data=cached}catch(e){}
  const validRates=value=>value&&typeof value==='object'&&Object.entries(value).some(([k,v])=>/^[A-Z]{3}$/.test(k)&&Number.isFinite(Number(v))&&Number(v)>0);
  function snapshot(){return data}
  function rubPerUnit(code){
    if(code==='RUB')return 1;
    const perRub=Number(data?.rates?.[code]);
    return Number.isFinite(perRub)&&perRub>0?1/perRub:null;
  }
  function options(){
    let codes=data?.rates?Object.keys(data.rates):FALLBACK;
    if(!codes.includes('RUB'))codes=['RUB',...codes];
    const names=new Intl.DisplayNames(['ru'],{type:'currency'});
    return codes.sort((a,b)=>a==='RUB'?-1:b==='RUB'?1:a.localeCompare(b)).map(code=>{
      let name=code;try{name=names.of(code)||code}catch(e){}
      return {code,label:code==='RUB'?'RUB — Российский рубль':code+' — '+name};
    });
  }
  async function refresh(){
    if(data&&Number(data.nextUpdate||0)*1000>Date.now())return data;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
    try{
      const response=await fetch('https://open.er-api.com/v6/latest/RUB',{method:'GET',mode:'cors',credentials:'omit',cache:'no-store',signal:controller.signal,headers:{'Accept':'application/json'}});
      if(!response.ok)throw new Error('Rates request failed: '+response.status);
      const body=await response.json();
      if(body.result!=='success'||body.base_code!=='RUB'||!validRates(body.rates)||!Number.isFinite(Number(body.time_last_update_unix)))throw new Error('Invalid rates response');
      data={base:'RUB',rates:body.rates,updatedAt:Number(body.time_last_update_unix)*1000,nextUpdate:Number(body.time_next_update_unix)||0};
      try{localStorage.setItem(KEY,JSON.stringify(data))}catch(e){}
      window.dispatchEvent(new CustomEvent('saymo-rates-updated'));
      return data;
    }finally{clearTimeout(timer)}
  }
  window.SaymoSaldoCurrency={snapshot,rubPerUnit,options,refresh};
  if(!data||Number(data.nextUpdate||0)*1000<=Date.now())refresh().catch(()=>{});
  else window.dispatchEvent(new CustomEvent('saymo-rates-updated'));
})();