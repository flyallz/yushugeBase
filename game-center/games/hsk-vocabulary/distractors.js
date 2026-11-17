(function(root){
 'use strict';
 // Levels 1–3 continue to use their original question generator.
 const norm=s=>String(s||'').toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
 const semanticFamilies=[
  ['vui','hanh phuc','sung suong','hoan hi'],['buon','sau','au lo','lo au','phien muon'],['tuc gian','gian du','buc minh','kho chiu','phan no'],
  ['so hai','khiep','dang so','kinh hoang'],['yeu','quy men','tran trong','thuong men'],['ghet','chan ngan','chan ghet','ghet bo'],
  ['thi thuc','giay to','giay chung nhan','ho so','chung chi'],['an ai','dam tham','than yeu','than mat','than thiet','triu men'],['nho','tuong nho','hoai niem'],['mong','khao khat','uoc ao','ky vong'],['nghi ngo','hoai nghi','kho tin'],
  ['tin chac','tin tuong','tin cay'],['hieu','nhan thuc','y thuc','biet ro'],['nghi','tu duy','suy tu','tuong tuong'],
  ['nha','cho o','can ho'],['que','nong thon','thon lang'],['tien','tai chinh','tiet kiem'],['chong','lao cong','ong xa'],['vo','ba xa'],
  ['me','than mau','mau than'],['cha','bo','than phu'],['nguoi','nhan loai','cong chung','dan chung'],
  ['nhin','quan sat','xem','ngo'],['noi','phat bieu','ke','trinh bay','tuong thuat'],['la het','gao','theu theu','keu goi'],
  ['nghe','lang tai'],['cho','doi'],['thuc giuc','hoi thuc','don doc'],['chuyen','dua','trao','giao'],
  ['den','toi','tiep can'],['roi','thoat','di khoi'],['lam','thuc hien','thi hanh','tien hanh'],
  ['chuan bi','san sang','ap u'],['xay','lap','tao','kien tao'],['sua','chinh','cai thien','cai tien'],
  ['so sanh','doi chieu'],['giong','tuong tu'],['khac','khong giong'],['nhanh','mau','khan truong'],['cham','tu tu','thong tha'],
  ['ngay lap tuc','lap tuc','tuc khac','dung luc'],['yen','on dinh','binh tinh','thanh binh'],['dep','xinh','my le','tuyet dep'],
  ['tot','hay','uu tu','xuat sac'],['xau','toi te','kem'],['nhieu','phong phu','doi dao'],['it','hiem','thieu'],
  ['to','lon','rong','bao la'],['nho be','be nho','ti hon'],['manh','khoe','cuong trang'],['yeu ot','mong manh','nhu nhuoc'],
  ['thong minh','tai ba','gioi','thanh thao'],['cham chi','sieng nang','can cu','can lao'],['tha thu','khoan dung','bo qua'],
  ['che','giau','an','bi mat'],['canh tranh','thi dau','doi thu'],['ket thuc','hoan thanh','cham dut'],['mo dau','bat dau','khoi dau'],
  ['ton trong','kinh trong','kinh ne'],['nghiem','khat khe','trinh trong'],['ho tro','giup','tro giup'],['cho phep','dong y','chap nhan'],
  ['tu choi','bac bo','phan bac'],['lua','gia doi','khong that'],['that','chan thuc','trung thuc'],['dung','ngung','tam nghi']
 ].map(a=>a.map(norm));
 const contains=(text,phrase)=>(' '+text+' ').includes(' '+phrase+' ');
 const featureCache=new Map();
 function features(w){const cached=featureCache.get(w.meaning);if(cached)return cached;const text=norm(w.meaning),tokens=new Set(text.split(' ').filter(Boolean));const result={text,tokens,families:new Set(semanticFamilies.flatMap((f,i)=>f.some(x=>contains(text,x))?[i]:[]))};featureCache.set(w.meaning,result);return result;}
 function posSet(pos){const p=String(pos||'').toLocaleLowerCase('vi'),out=new Set();for(const [key,re] of [['n',/danh từ|\bdt\./],['v',/động từ|đgt\./],['a',/tính từ|\btt\./],['adv',/phó|trạng từ/],['pron',/đại từ|đại\.|đt\./],['prep',/giới/],['conj',/liên/],['measure',/lượng/],['interj',/thán|ct\./]])if(re.test(p))out.add(key);return out;}
 const intersects=(a,b)=>[...a].some(x=>b.has(x));
 let lastData=null,entries=[],senses=new Map(),cached=new Map();
 function index(data){if(lastData===data)return;lastData=data;entries=[];senses=new Map();cached.clear();for(const [lv,lessons] of Object.entries(data))for(const lesson of lessons)for(const word of lesson.words){const e={...word,sourceLevel:Number(lv),sourceLesson:lesson.number,f:features(word),posTags:posSet(word.pos)};entries.push(e);if(!senses.has(word.hanzi))senses.set(word.hanzi,[]);senses.get(word.hanzi).push(e.f);}}
 function compatible(word,candidate){
  if(word.hanzi===candidate.hanzi||word.hanzi.includes(candidate.hanzi)||candidate.hanzi.includes(word.hanzi))return false;
  const target=[features(word),...(senses.get(word.hanzi)||[])],other=senses.get(candidate.hanzi)||[features(candidate)];
  // Check every supplied sense, including duplicate words from different levels.
  return !target.some(a=>other.some(b=>a.text===b.text||intersects(a.tokens,b.tokens)||intersects(a.families,b.families)));
 }
 function ranked(word,ctx){const {level,maxLesson,difficulty}=ctx,cacheKey=JSON.stringify([level,maxLesson,difficulty,word.hanzi,word.meaning,word.pos]);if(cached.has(cacheKey))return cached.get(cacheKey);
  const tags=posSet(word.pos),chars=new Set([...word.hanzi]),seen=new Set();
  const list=entries.filter(e=>[level-1,level].includes(e.sourceLevel)&&e.sourceLesson<=(e.sourceLevel===level?maxLesson:Infinity)&&compatible(word,e)).filter(e=>{if(seen.has(e.hanzi))return false;seen.add(e.hanzi);return true;}).map(e=>{
   const length=Math.abs([...e.hanzi].length-[...word.hanzi].length),samePos=tags.size&&intersects(tags,e.posTags),shared=[...e.hanzi].filter(x=>chars.has(x)).length;
   // Both modes favor familiar words. Hard further favors look-alike forms.
   return{entry:e,rank:(samePos?50:0)+Math.max(0,20-length*8)+(difficulty==='hard'?shared*12:shared*2)};
  }).sort((a,b)=>b.rank-a.rank);
  cached.set(cacheKey,list);if(cached.size>128)cached.delete(cached.keys().next().value);return list;
 }
 function question(word,count,ctx,rng=Math.random){
  if(![4,5,6].includes(ctx.level))return root.HSKCore.question(word,count,rng);
  index(ctx.data||root.HSK_VOCAB);const rankedEntries=ranked(word,ctx);if(rankedEntries.length<count-1)throw Error('Chưa đủ đáp án nhiễu phù hợp cho '+word.hanzi);
  const windowSize=ctx.difficulty==='hard'?18:65;
  // Race: one distractor from each level where possible; head: alternate source at random.
  const sources=root.HSKCore.shuffle([ctx.level-1,ctx.level],rng),chosen=[];
  for(let i=0;i<count-1;i++){
   let candidates=rankedEntries.filter(x=>x.entry.sourceLevel===sources[i%sources.length]&&!chosen.some(c=>c.hanzi===x.entry.hanzi));
   if(!candidates.length)candidates=rankedEntries.filter(x=>!chosen.some(c=>c.hanzi===x.entry.hanzi));
   let pool=root.HSKCore.shuffle(candidates,rng).sort((a,b)=>b.rank-a.rank).slice(0,windowSize);
   const best=pool[0].rank;pool=pool.filter(x=>x.rank>=best-(ctx.difficulty==='hard'?10:20));
   const e=pool[Math.floor(rng()*pool.length)].entry;chosen.push(e);
  }
  const selected=chosen.map(e=>({hanzi:e.hanzi,pinyin:e.pinyin,meaning:e.meaning,pos:e.pos,sourceLevel:e.sourceLevel,sourceLesson:e.sourceLesson,correct:false}));
  const options=root.HSKCore.shuffle([{...word,correct:true},...selected],rng);
  if(options.filter(o=>o.correct).length!==1||new Set(options.map(o=>o.hanzi)).size!==count)throw Error('Câu hỏi trùng đáp án');return{word,options};
 }
 root.HSKDistractors={question,compatible,features};if(typeof module!=='undefined')module.exports=root.HSKDistractors;
})(typeof window!=='undefined'?window:globalThis);
