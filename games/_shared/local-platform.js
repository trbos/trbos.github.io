(() => {
  'use strict';
  // Native Yandex-template names are retained; all saved data remains in the
  // caller's isolated, per-game storage. Ad skips complete only local game
  // callbacks; no ad network request, impression, or online account is created.
  window.createLocalGamePlatform = function createLocalGamePlatform(options) {
    const {id,storage,getInstance,markReady} = options;
    const language = String(options.language || navigator.language || 'en').split('-')[0];
    const ua = navigator.userAgent || '';
    const tablet = /iPad/i.test(ua) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const mobile = tablet || /Android|iPhone|iPod|Mobi/i.test(ua);
    const deviceType = tablet ? 'tablet' : mobile ? 'mobile' : 'desktop';
    const environment = JSON.stringify({language,lang:language,domain:location.hostname,deviceType,
      isMobile:mobile,isDesktop:!mobile,isTablet:tablet,isTV:false,appID:id,browserLang:navigator.language || language,
      payload:'',promptCanShow:false,reviewCanShow:false,platform:navigator.platform || '',
      browser:/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Other'});
    const playerData = JSON.stringify({playerAuth:'rejected',playerName:'unauthorized',playerId:'unauthorized',playerPhoto:'null'});
    const paymentsData = JSON.stringify({hasPayments:false,catalog:[],products:[],purchases:[]});
    let timer = null,disposed = false;
    const pending = [];
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    function data(value) {
      try {
        if (typeof value !== 'string' || value.length > 1048576) return null;
        const parsed = JSON.parse(value);
        if (!object(parsed)) return null;
        return JSON.parse(JSON.stringify(parsed));
      } catch {return null;}
    }
    function read(key) {try {return data(storage.getItem(key)) || {};} catch {return {};}}
    function write(key,value) {
      try {
        const text = JSON.stringify(value),parsed = data(text);
        if (!parsed) return false;
        storage.setItem(key,JSON.stringify(parsed));return true;
      } catch {return false;}
    }
    function flush() {
      clearTimeout(timer);timer = null;
      if (disposed || !pending.length) return;
      const instance = getInstance?.();
      while (pending.length && pending[0].until < Date.now()) pending.shift();
      if (instance && typeof instance.SendMessage === 'function') {
        while (pending.length) {
          const item = pending.shift();
          if (item.value === undefined) instance.SendMessage('YandexGame',item.method);
          else instance.SendMessage('YandexGame',item.method,item.value);
        }
      } else if (pending.length) timer = setTimeout(flush,50);
    }
    function send(method,value) {
      if (disposed) return;
      if (pending.length >= 32) pending.shift();
      pending.push({method,value,until:Date.now()+5000});flush();
    }
    function loadCloud() {
      let text;
      try {text = storage.getItem('sdk:cloud');} catch {}
      const parsed = data(text);
      window.cloudSaves = parsed ? JSON.stringify(parsed) : 'noData';
      window.__ysdkCloudSavesRaw = window.cloudSaves;
      return window.cloudSaves;
    }
    const unavailable = () => Promise.reject(new Error('Online platform unavailable'));
    const localPlayer = {
      getMode:()=>'lite',getUniqueID:()=>'',getName:()=>'',getPhoto:()=>'',getPayingStatus:()=>'not_paying',isAuthorized:()=>false,
      getData:async()=>read('sdk:data'),setData:async value=>{if(!object(value)||!write('sdk:data',{...read('sdk:data'),...value}))throw Error('Save unavailable');},
      getStats:async()=>read('sdk:stats'),setStats:async value=>{if(!object(value)||!Object.values(value).every(Number.isFinite)||!write('sdk:stats',{...read('sdk:stats'),...value}))throw Error('Save unavailable');},
      incrementStats:async value=>{
        if(!object(value)||!Object.values(value).every(Number.isFinite))throw Error('Invalid stats');
        const stats=read('sdk:stats');for(const [key,amount]of Object.entries(value)){const next=(Number(stats[key])||0)+amount;if(!Number.isFinite(next))throw Error('Invalid stats');Object.defineProperty(stats,key,{value:next,enumerable:true,configurable:true,writable:true});}
        if(!write('sdk:stats',stats))throw Error('Save unavailable');
      }
    };
    const skipAd = (value={},rewarded=false) => {
      const callbacks = value.callbacks || {};
      void Promise.resolve().then(() => {
        callbacks.onOpen?.();
        try {if(rewarded)callbacks.onRewarded?.();}
        finally {callbacks.onClose?.(true);}
      });
      return true;
    };
    const sdk = {
      environment:{i18n:{lang:language,tld:'com'},app:{id},browser:{lang:language},payload:''},
      deviceInfo:{type:deviceType,isMobile:()=>mobile,isDesktop:()=>!mobile,isTablet:()=>tablet,isTV:()=>false},
      features:{LoadingAPI:{ready:()=>markReady?.()},GameplayAPI:{start(){},stop(){}}},
      player:localPlayer,getPlayer:async()=>localPlayer,getStorage:async()=>storage,
      getPayments:unavailable,getLeaderboards:unavailable,getFlags:async()=>({}),
      auth:{openAuthDialog:unavailable},adv:{showFullscreenAdv:value=>skipAd(value),showRewardedVideo:value=>skipAd(value,true),
        getBannerAdvStatus:async()=>({stickyAdvIsShowing:false}),showBannerAdv:()=>false,hideBannerAdv:()=>false},
      getServerTime:()=>Date.now(),serverTime:()=>Date.now(),showBanner:()=>false,hideBanner:()=>false,on(){},off(){},dispatchEvent(){},
      localBridge:{flush,dispose(){disposed=true;clearTimeout(timer);pending.length=0;}}
    };
    sdk.init = async()=>sdk;
    const focus = () => document.querySelector('canvas')?.focus();
    Object.assign(window,{
      environmentData:environment,playerData,paymentsData,flagsData:'{}',flasgsData:'{}',__ysdkEnvironmentDataRaw:environment,__ysdkPaymentsDataRaw:paymentsData,
      ysdk:sdk,YSDK:sdk,sdk,player:localPlayer,YaGames:{init:sdk.init,initSDK:sdk.init,getPlayer:sdk.getPlayer,getStorage:sdk.getStorage,features:sdk.features},
      initGame:false,nowFullAdOpen:false,sounds:[],
      InitGame(){window.initGame=true;return environment;},
      InitSDK(callback){if(typeof callback==='function')callback(sdk);return sdk;},
      RequestingEnvironmentData(sendback){if(sendback)send('SetEnvirData',environment);return environment;},
      InitPlayer(sendback){if(sendback)send('SetInitializationSDK',playerData);return playerData;},
      LoadCloud(sendback){const value=loadCloud();if(sendback)send('SetLoadSaves',value);return value;},
      SaveCloud(value){const parsed=data(value);if(!parsed||!write('sdk:cloud',parsed))return false;loadCloud();return true;},
      GetPayments(sendback){if(sendback)send('PaymentsEntries',paymentsData);return paymentsData;},
      OpenAuthDialog(){send('SetInitializationSDK',playerData);return false;},
      FullAdShow(){void Promise.resolve().then(()=>{window.nowFullAdOpen=false;send('CloseFullAd','true');focus();});return true;},
      RewardedShow(rewardId){
        const reward=typeof rewardId==='number'&&Number.isFinite(rewardId)?rewardId:typeof rewardId==='string'&&rewardId.length<=128?rewardId:0;
        void Promise.resolve().then(()=>{send('RewardVideo',reward);send('CloseRewardVideo');focus();});return true;
      },
      StickyAdActivity:()=>false,InitLeaderboard:()=>false,InitLeaderboards:()=>false,
      GetLeaderboardScores:()=>JSON.stringify({entries:[]}),SetLeaderboardScores:()=>false,
      BuyPayments:()=>false,ConsumePurchase:()=>false,ConsumePurchases:()=>false,Review:()=>false,PromptShow:()=>false,
      PaintRBT:()=>false,StaticRBTDeactivate:()=>false,ActivityRTB1:()=>false,ActivityRTB2:()=>false,
      ExecuteCodeRTB1:()=>false,ExecuteCodeRTB2:()=>false,RecalculateRTB1:()=>false,RecalculateRTB2:()=>false,
      GameReadyAPI(){markReady?.();return true;},LanguageRequest:()=>language,FocusGame:focus,
      LogStyledMessage(){},checkForTouchDevice:()=>navigator.maxTouchPoints>0,ym(){}
    });
    loadCloud();
    return sdk;
  };
})();
