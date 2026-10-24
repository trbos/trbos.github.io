(() => {
  'use strict';
  window.createOtherGamePlatform=({id,language,storage,getInstance,markReady,sdk})=>{
    const noop=()=>{},set=(name,value)=>{if(typeof window[name]==='undefined')window[name]=value;};
    const localReward=()=>{const state=window.NativeGameStatus;if(state)state.localRewards=(state.localRewards||0)+1;};
    const send=(object,method,value)=>{let tries=0;const run=()=>{const game=getInstance();if(!game){if(tries++<100)setTimeout(run,30);return;}if(value===undefined)game.SendMessage(object,method);else game.SendMessage(object,method,String(value));};run();};
    if(id==='tap-goal')window.ShowInter=callback=>{queueMicrotask(()=>callback?.());return 'closed';};
    for(const name of ['ShowFixedRK','HideFixedRK','StaticRBTDeactivate','StickyAdActivity','ActivityRTB1','ActivityRTB2','ExecuteCodeRTB1','ExecuteCodeRTB2','PaintRBT','RecalculateRTB1','RecalculateRTB2','ym'])set(name,noop);
    set('v_sdk_init',(...args)=>{for(const f of args)if(typeof f==='function')f(sdk);return true;});
    if(['holeio','gvibes','eat-blobs-simulator'].includes(id)){
      const bridge=window.UnitySDK=window.UnitySDK||{};bridge.logError=console.error.bind(console);bridge.log=console.log.bind(console);
      window.InitSDKJs=()=>{bridge.onSdkScriptLoaded?.();send('RHMAdsManager','InitSucceed','offline');return true;};
      window.GameReadyAPI=markReady;
      window.CallInterstitialAdsJs=()=>{send('RHMAdsManager','resumeGame');return 'closed';};
      window.CallInterstitialAdsPauseJs=()=>{send('RHMAdsManager','resumeAudio');return 'closed';};
      window.LoadRewardedAdsJs=()=>{send('RHMAdsManager','isRewardedAdsLoaded','true');return true;};
      window.CallRewardedAdsJs=()=>{localReward();send('RHMAdsManager','RewardedAdsSuccessfull');return 'rewarded';};
    }
    if(['99-nights-in-the-forest','melon-playground','rocketgoal-io'].includes(id)){
      const falseNames=['Interstitial','Rewarded','Banner','PlayerAuthorization','Payments','Share','AddToFavorites','AddToHomeScreen','CreatePost','InviteFriends','JoinCommunity','Leaderboard','LeaderboardGetEntries','LeaderboardGetScore','LeaderboardMultipleBoards','LeaderboardNativePopup','LeaderboardSetScore','Achievements','AchievementsNativePopup','GetAchievementsList','RemoteConfig','PlatformGetAllGames','PlatformGetGameById','Rate','ExternalLinksAllowed'];
      for(const n of falseNames){window['getIs'+n+'Supported']=()=> 'false';window['is'+n+'Supported']=()=>false;}
      Object.assign(window,{getInterstitialState:()=> 'closed',getRewardedState:()=> 'closed',getBannerState:()=> 'hidden',getRewardedPlacement:()=>'',getMinimumDelayBetweenInterstitial:()=> '0',showInterstitial:()=> 'closed',showRewarded:()=> 'closed',showReward:()=> 'closed',showBanner:()=> 'hidden',hideBanner:()=> 'hidden',setMinimumDelayBetweenInterstitial:()=> '0',getIsStorageSupported:()=> 'true',getIsStorageAvailable:()=> 'true',getStorageDefaultType:()=> 'local_storage',setStorageData:(key,value)=>storage.setItem(key,value),getStorageData:key=>storage.getItem(key)||'',deleteStorageData:key=>storage.removeItem(key),getPlayerId:()=>'',getPlayerName:()=>'',getPlayerPhotos:()=>'',getPlayerExtra:()=>'',getIsPlayerAuthorized:()=> 'false',getPlatformId:()=> 'web',getPlatformLanguage:()=>language,getPlatformPayload:()=>'',getPlatformTld:()=> 'local',getDeviceType:()=>navigator.maxTouchPoints?'mobile':'desktop',getVisibilityState:()=>document.visibilityState,getIsPlatformAudioEnabled:()=> 'true',getServerTime:()=>String(Date.now()),getLeaderboardsType:()=>'',getIsExternalLinksAllowed:()=> 'false',sendMessageToPlatform:noop,checkAdBlock:()=> 'true'});
      let rewarded='closed';window.getRewardedState=()=>rewarded;window.getIsRewardedSupported=()=> 'true';window.isRewardedSupported=()=>true;
      window.showRewarded=window.showReward=()=>{localReward();rewarded='rewarded';return rewarded;};
      for(const name of ['authorizePlayer','achievementsGetList','achievementsUnlock','achievementsShowNativePopup','addToFavorites','addToHomeScreen','inviteFriends','joinCommunity','share','createPost','rate','leaderboardsGetEntries','leaderboardsSetScore','leaderboardsShowNativePopup','paymentsGetCatalog','paymentsGetPurchases','paymentsPurchase','paymentsConsumePurchase','getAllGames','getGameById'])set(name,()=>false);
      set('InitYandexHtml',()=>true);set('LoadingAPIYandexHtml',markReady);set('remoteConfigGet',()=>'');
    }
    if(id==='kart-bros'){
      // AdinPlay's queues stay idle because no advertisement service is loaded.
      window.aiptag={cmd:{display:[],player:[]}};
    }
    if(['archers','ragdoll-archers'].includes(id)){
      const unavailable=callback=>callback?.({message:'Online account unavailable'},null);
      const api={environment:'local',addInitCallback:callback=>callback({environment:'local'}),game:{gameplayStart:noop,gameplayStop:noop,happytime:noop},
        ad:{hasAdblock:callback=>callback(null,false),requestAd:(type,callbacks={})=>{callbacks.adStarted?.();if(/reward/i.test(String(type)))localReward();queueMicrotask(()=>callbacks.adFinished?.());}},
        banner:{requestOverlayBanners:(banners,callback)=>{for(const item of banners||[])callback?.(item.id||'','bannerError',{message:'Banner unavailable'});},clearAllBanners:noop},
        user:{getUser:unavailable,getUserToken:unavailable,getXsollaUserToken:unavailable,showAuthPrompt:unavailable,showAccountLinkPrompt:unavailable,addAuthListener:noop,addScore:noop},
        data:{getItem:key=>storage.getItem(key),setItem:(key,value)=>storage.setItem(key,value),removeItem:key=>storage.removeItem(key),clear:()=>storage.clear()}};
      window.CrazyGames={SDK:api};window.Crazygames={requestInviteUrl:noop};
      // This fixed SDK URL is part of the native template. The SDK API above is
      // local; an empty local script supplies its ordinary load event without a
      // request to an advertisement host or execution of remote code.
      const descriptor=Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype,'src'),empty=URL.createObjectURL(new Blob([''],{type:'application/javascript'}));
      if(descriptor?.set&&descriptor?.get)Object.defineProperty(HTMLScriptElement.prototype,'src',{configurable:true,enumerable:descriptor.enumerable,get:descriptor.get,set(value){const url=new URL(value,document.baseURI);if(url.href==='https://trafficjam3d.github.io/vs/crazygames-sdk-v2.js')descriptor.set.call(this,empty);else descriptor.set.call(this,value);}});
      addEventListener('pagehide',()=>URL.revokeObjectURL(empty));
    }
  };
})();
