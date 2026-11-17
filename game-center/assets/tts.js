(function(){
  'use strict';
  const FEMALE_HINTS = [
    'xiaoxiao','xiaoyi','xiaohan','xiaomeng','xiaorui','xiaoshuang','xiaoqiu','xiaoxuan','xiaoyan','xiaoyou','xiaozhen',
    'tingting','huihui','yaoyao','meijia','lili','lisa','female','woman','女声','女','晓晓','晓伊','婷婷','慧慧','瑶瑶','美佳'
  ];
  const MAINLAND_HINTS = ['zh-cn','cmn-cn','mandarin','putonghua','普通话','mainland','china','中国大陆','北京','beijing'];
  const MALE_HINTS = ['yunxi','yunyang','yunjian','kangkang','danny','male','man','男声','男'];
  const USER_KEY = 'hanzi_game_voice_name';
  let cachedVoices = [];
  let selectedVoice = null;

  function normalize(s){ return String(s || '').toLowerCase(); }

  function scoreVoice(v){
    const name = normalize(v.name);
    const lang = normalize(v.lang);
    let score = 0;
    if(lang === 'zh-cn' || lang === 'cmn-cn') score += 120;
    else if(lang.startsWith('zh-cn') || lang.startsWith('cmn-cn')) score += 110;
    else if(lang.startsWith('zh')) score += 70;
    if(v.localService) score += 6;
    if(MAINLAND_HINTS.some(x => name.includes(x) || lang.includes(x))) score += 20;
    if(FEMALE_HINTS.some(x => name.includes(x))) score += 45;
    if(MALE_HINTS.some(x => name.includes(x))) score -= 35;
    if(name.includes('natural')) score += 12;
    if(name.includes('neural')) score += 12;
    return score;
  }

  function refreshVoices(){
    try{
      cachedVoices = (window.speechSynthesis && window.speechSynthesis.getVoices)
        ? window.speechSynthesis.getVoices() || [] : [];
      const candidates = cachedVoices.filter(v => /^zh|^cmn/i.test(v.lang || '')).sort((a,b) => scoreVoice(b) - scoreVoice(a));
      let saved = '';
      try { saved = localStorage.getItem(USER_KEY) || ''; } catch (_) {}
      selectedVoice = candidates.find(v => v.name === saved) || candidates[0] || null;
    }catch(_){ selectedVoice = null; }
    return selectedVoice;
  }

  function speak(text, options){
    if(!text || !('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return false;
    try{
      const synth = window.speechSynthesis;
      if(!selectedVoice) refreshVoices();
      synth.cancel();
      const u = new window.SpeechSynthesisUtterance(String(text));
      u.lang = 'zh-CN';
      u.rate = options && options.rate ? options.rate : 0.82;
      u.pitch = options && options.pitch ? options.pitch : 1.03;
      u.volume = 1;
      if(selectedVoice) u.voice = selectedVoice;
      synth.speak(u);
      return true;
    }catch(_){ return false; }
  }

  function stop(){
    try{ if(window.speechSynthesis) window.speechSynthesis.cancel(); }catch(_){}
  }

  function label(){
    if(!selectedVoice) refreshVoices();
    return selectedVoice ? selectedVoice.name : 'Giọng zh-CN mặc định của thiết bị';
  }

  function listVoices(){
    refreshVoices();
    return cachedVoices.filter(v => /^zh|^cmn/i.test(v.lang || '')).sort((a,b) => scoreVoice(b) - scoreVoice(a)).map(v => ({name:v.name,lang:v.lang,localService:!!v.localService}));
  }

  function setVoice(name){
    refreshVoices();
    const found = cachedVoices.find(v => v.name === name && /^zh|^cmn/i.test(v.lang || ''));
    if(!found) return false;
    selectedVoice = found;
    try { localStorage.setItem(USER_KEY, found.name); } catch (_) {}
    return true;
  }

  function test(){ return speak('你好，欢迎来到汉字游戏中心。', {rate:0.8}); }

  if('speechSynthesis' in window){
    try{
      refreshVoices();
      window.speechSynthesis.addEventListener && window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
      if('onvoiceschanged' in window.speechSynthesis){
        const prev = window.speechSynthesis.onvoiceschanged;
        window.speechSynthesis.onvoiceschanged = function(e){ refreshVoices(); if(typeof prev === 'function') prev.call(this,e); };
      }
    }catch(_){}
  }

  window.GameCenterTTS = { speak, stop, label, test, refreshVoices, listVoices, setVoice };
})();
