(function(root){
 'use strict';
 const key=w=>JSON.stringify([w.hanzi,w.pinyin,w.meaning]);
 function groups(lessons,level){const spans=[4,5,6].includes(level)?Array.from({length:Math.ceil(lessons.length/5)},(_,i)=>[i*5+1,Math.min(i*5+5,lessons.length)]):[[1,5],[6,10],[11,15]];if(level===3)spans.push([15,18]);return [...spans.map(([from,to])=>({key:from+'-'+to,from,to,after:to,label:'Ôn tập Bài '+from+'–'+to})),{key:'all',from:1,to:lessons.length,after:lessons.length,label:'Ôn tập tổng HSK'+level}];}
 function pool(lessons,g){const subset=lessons.filter(l=>l.number>=g.from&&l.number<=g.to),words=[],seen=new Set();for(const l of subset)for(const w of l.words){const id=key(w);if(!seen.has(id)){seen.add(id);words.push({...w,reviewId:id,sourceLesson:l.number});}}return{words,count:Math.min(words.length,Math.ceil(subset.reduce((n,l)=>n+l.words.length,0)/subset.length*2))};}
 function plan(lessons,g,record,shuffle){const {words,count}=pool(lessons,g),ids=words.map(w=>w.reviewId),signature=JSON.stringify(ids);let remaining=record?.signature===signature?[...record.remaining]:[],cycle=record?.signature===signature?record.cycle:0;const selected=[],chosen=new Set();
  while(selected.length<count){if(!remaining.length){remaining=shuffle(ids);cycle++;}const pos=remaining.findIndex(id=>!chosen.has(id));if(pos<0)throw Error('Không đủ từ riêng biệt cho lượt ôn');const id=remaining.splice(pos,1)[0];selected.push(id);chosen.add(id);}
  const lookup=new Map(words.map(w=>[w.reviewId,w]));return{words:selected.map(id=>lookup.get(id)),record:{signature,remaining,cycle},total:words.length,count};
 }
 root.HSKReviews={groups,pool,plan};if(typeof module!=='undefined')module.exports=root.HSKReviews;
})(typeof window!=='undefined'?window:globalThis);
