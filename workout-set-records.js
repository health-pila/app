/* 여러 운동의 세트 기록. 사용자 입력은 HTML로 해석하지 않습니다. */
(() => {
  'use strict';
  const fields = [['weight','중량(kg)',8],['reps','횟수',5],['comment','코멘트',120]];
  const blank = () => Array.from({length:5},()=>({weight:'',reps:'',comment:'',completed:false}));
  function clean(value) {
    if (!Array.isArray(value) || !value.length || value.length>10) return null;
    const result=[];
    for (const exercise of value) {
      if (!exercise || typeof exercise.name!=='string' || !exercise.name.trim() || exercise.name.length>80 || !Array.isArray(exercise.sets) || exercise.sets.length!==5) return null;
      const sets=[];
      for (const set of exercise.sets) {
        if (!set || typeof set.completed!=='boolean' || fields.some(([key,,max])=>typeof set[key]!=='string'||set[key].length>max)) return null;
        sets.push({weight:set.weight,reps:set.reps,comment:set.comment,completed:set.completed});
      }
      if (!sets.some(s=>s.completed||fields.some(([key])=>s[key].trim()))) return null;
      result.push({name:exercise.name.trim(),sets});
    }
    return result;
  }
  function node(tag,cls,text) {const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  function table(sets,editable) {
    const wrap=node('div','workout-set-scroll'),t=node('table','workout-set-table');
    const head=document.createElement('thead'),tr=document.createElement('tr');tr.append(node('th','','항목'));
    sets.forEach((s,i)=>{const th=node('th','',`${i+1}세트 `);th.scope='col';const c=document.createElement('input');c.type='checkbox';c.checked=s.completed;c.disabled=!editable;c.dataset.set=String(i);c.setAttribute('aria-label',`${i+1}세트 완료`);th.append(c);tr.append(th);});head.append(tr);
    const body=document.createElement('tbody');fields.forEach(([key,label,max])=>{const row=document.createElement('tr'),th=node('th','',label);th.scope='row';row.append(th);sets.forEach((s,i)=>{const td=document.createElement('td');if(editable){const input=document.createElement(key==='comment'?'textarea':'input');input.maxLength=max;input.value=s[key];input.dataset.key=key;input.dataset.set=String(i);input.setAttribute('aria-label',`${i+1}세트 ${label}`);if(key!=='comment')input.inputMode=key==='weight'?'decimal':'numeric';else input.rows=2;td.append(input);}else td.textContent=s[key]||'—';row.append(td);});body.append(row);});t.append(head,body);wrap.append(t);return wrap;
  }
  function editor(host) {
    function add(value={name:'',sets:blank()}) {
      if(host.children.length>=10)return;
      const card=node('section','workout-set-editor');const label=node('label','','운동 이름');const name=document.createElement('input');name.type='text';name.maxLength=80;name.value=value.name;name.placeholder='운동 이름 직접 입력';name.dataset.exerciseName='';name.setAttribute('aria-label','운동 이름');label.append(name);
      const remove=node('button','','이 운동 삭제');remove.type='button';remove.addEventListener('click',()=>card.remove());card.append(label,remove,table(value.sets,true));host.append(card);return name;
    }
    function read() {
      if(!host.children.length)return null;
      const value=[...host.children].map(card=>({name:card.querySelector('[data-exercise-name]').value.trim(),sets:Array.from({length:5},(_,i)=>{const s={completed:card.querySelector(`input[type="checkbox"][data-set="${i}"]`).checked};fields.forEach(([key])=>s[key]=card.querySelector(`[data-key="${key}"][data-set="${i}"]`).value.trim());return s;})}));
      const result=clean(value);if(!result)throw new Error('각 운동의 이름과 세트 기록을 입력해 주세요. 사용하지 않는 표는 삭제할 수 있어요.');return result;
    }
    return {add,read,clear:()=>host.replaceChildren(),load:value=>{host.replaceChildren();(clean(value)||[]).forEach(add);}};
  }
  function render(value, afterExercise) {
    const rows=clean(value);if(!rows)return null;
    const root=node('div','workout-saved-sets');rows.forEach((e,index)=>{const card=node('section','workout-saved-exercise');card.append(node('h3','',e.name),table(e.sets,false));afterExercise?.(card,index);root.append(card);});return root;
  }
  window.WorkoutSetRecords=Object.freeze({clean,editor,render,has:record=>Boolean(clean(record?.set_records))});
})();
