(function(root){
const DECOYS=[['苹果','píngguǒ','quả táo'],['猫','māo','con mèo'],['狗','gǒu','con chó'],['飞机','fēijī','máy bay'],['火车','huǒchē','tàu hỏa'],['书','shū','sách'],['牛奶','niúnǎi','sữa bò'],['茶','chá','trà'],['咖啡','kāfēi','cà phê'],['水','shuǐ','nước'],['米饭','mǐfàn','cơm'],['鸡蛋','jīdàn','trứng gà'],['香蕉','xiāngjiāo','quả chuối'],['桌子','zhuōzi','cái bàn'],['椅子','yǐzi','cái ghế'],['电脑','diànnǎo','máy tính'],['手机','shǒujī','điện thoại di động'],['雨','yǔ','mưa'],['雪','xuě','tuyết'],['太阳','tàiyáng','mặt trời'],['月亮','yuèliang','mặt trăng'],['花','huā','hoa'],['山','shān','núi'],['河','hé','sông'],['海','hǎi','biển'],['门','mén','cửa'],['窗户','chuānghu','cửa sổ'],['衣服','yīfu','quần áo'],['鞋','xié','giày'],['眼睛','yǎnjing','mắt'],['耳朵','ěrduo','tai'],['鼻子','bízi','mũi']].map(([hanzi,pinyin,meaning])=>({hanzi,pinyin,meaning}));
const tokens=s=>String(s).toLocaleLowerCase('vi').normalize('NFC').match(/[\p{L}\p{N}]+/gu)||[];
const key=s=>tokens(s).join(' ');
function shuffle(a,rng=Math.random){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
// Conservative distractors: distinct concrete meanings, no shared Vietnamese tokens or Hanzi.
function question(word,count,rng=Math.random){
 const t=new Set(tokens(word.meaning));const safe=DECOYS.filter(d=>d.hanzi!==word.hanzi&&!d.hanzi.includes(word.hanzi)&&!word.hanzi.includes(d.hanzi)&&!tokens(d.meaning).some(x=>t.has(x)));
 if(safe.length<count-1)throw Error('Không đủ đáp án nhiễu an toàn cho '+word.hanzi);
 const options=shuffle([{...word,correct:true},...shuffle(safe,rng).slice(0,count-1).map(d=>({...d,correct:false}))],rng);
 if(options.filter(x=>x.correct).length!==1||new Set(options.map(x=>key(x.meaning))).size!==count||new Set(options.map(x=>x.hanzi)).size!==count)throw Error('Câu hỏi trùng đáp án');
 return {word,options};
}
function available(level,difficulty){return [3,4,5,6].includes(level)?['medium','hard'].includes(difficulty):['easy','medium','hard'].includes(difficulty)}
function roll(points,width,height){let a=points[33],b=points[263];if(a.x>b.x)[a,b]=[b,a];return Math.atan2((b.y-a.y)*height,(b.x-a.x)*width)*180/Math.PI}
class HeadSelector{
 constructor(){this.reset()}
 reset(){this.ready=false;this.side=null;this.since=0;this.last=0;this.latched=false}
 update(angle,now,up=0,allowUp=false){
  if(this.last&&now-this.last>350){this.side=null;this.since=0}this.last=now;
  if(this.latched)return {state:'locked',progress:0};
  if(!Number.isFinite(angle)||!Number.isFinite(up)){this.side=null;this.since=0;return {state:'missing',progress:0}}
  if(!this.ready){if(Math.abs(angle)<=7&&Math.abs(up)<.25)this.ready=true;return {state:'center',progress:0}}
  if(allowUp&&up>.45&&Math.abs(angle)>8){this.side=null;this.since=0;return {state:'ambiguous',progress:0}}
  const side=allowUp&&up>.6?2:angle<-12&&up<.45?0:angle>12&&up<.45?1:null;
  if(side===null){this.side=null;this.since=0;return {state:'ready',progress:0}}
  if(side!==this.side){this.side=side;this.since=now}
  const progress=Math.min(1,(now-this.since)/1000);
  if(progress===1){this.latched=true;return {state:'chosen',side,progress}}
  return {state:'holding',side,progress};
 }
}
root.HSKCore={question,shuffle,available,roll,HeadSelector,key,decoys:DECOYS};
if(typeof module!=='undefined')module.exports=root.HSKCore;
})(typeof window!=='undefined'?window:globalThis);
