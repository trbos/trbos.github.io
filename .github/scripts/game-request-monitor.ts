type Result={idle?:boolean;busy?:boolean;stage?:string;failed?:boolean;retry?:boolean};
type Dependencies={pump():Promise<Result>;report?(result:Result):void;now?:()=>number;sleep?:(ms:number)=>Promise<void>;windowMs?:number;intervalMs?:number};
export async function monitorGameRequest(deps:Dependencies){
  const now=deps.now||Date.now,sleep=deps.sleep||(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  const deadline=now()+(deps.windowMs??600000),interval=deps.intervalMs??15000;
  for(;;){
    const result=await deps.pump();deps.report?.(result);
    if(result.failed||['added','unavailable','failed'].includes(result.stage||'')||(result.idle&&!result.busy))return result;
    const remaining=deadline-now();if(remaining<=0)return result;
    await sleep(Math.min(interval,remaining));
  }
}
