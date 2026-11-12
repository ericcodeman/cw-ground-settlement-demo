(function(root,factory){
  const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.StructureTiltMapPresentation=api;
})(typeof window==="undefined"?globalThis:window,function(){
  "use strict";
  const unavailable=reason=>({status:"UNAVAILABLE",reason});
  // Display adapter only. Saved engineering results are never recomputed or changed.
  function build(row,{scale=1,history=false,project}={}){
    if(![1,100,1000].includes(scale))return unavailable("Select display amplification x1, x100 or x1000.");
    if(!row||!["CURRENT","SUPERSEDED","REVERIFY_REQUIRED"].includes(row.sourceStatus))return unavailable("Source status unavailable.");
    const historical=row.sourceStatus!=="CURRENT";
    if(historical&&!history)return unavailable("Enable Historical source display to view this saved revision.");
    const {structure:s,configuration:c,baseline:b,observation:o,result:r,references:refs}=row;
    if(row.sourceIssue||!s||!c||!b||!o||!refs||["structure","configuration","baseline","observation"].some((key,i)=>{
      const source=[s,c,b,o][i],ref=refs[key];return !ref||ref.id!==source.id||ref.revision!==source.revision;
    }))return unavailable("Captured source revisions are unavailable or inconsistent.");
    if(!r||r.status!=="AVAILABLE"||r.method!=="HK1980_TARGET_PAIR_V1"||r.classification!=="DERIVED_TARGET_TILT")return unavailable("Supported saved target-pair result unavailable.");
    if([c,b,o,r].some(x=>x.crs!=="EPSG:2326")||c.structureId!==s.id||c.structureRevision!==s.revision||
      o.structureId!==s.id||o.structureRevision!==s.revision||o.configId!==c.id||o.configRevision!==c.revision||
      b.structureId!==s.id||b.structureRevision!==s.revision||
      b.configId!==c.id||b.configRevision!==c.revision||o.baselineObservationId!==b.id||o.baselineObservationRevision!==b.revision||
      r.configId!==c.id||r.configRevision!==c.revision||r.structureId!==s.id||r.structureRevision!==s.revision||r.heightM!==c.heightM||r.date!==o.date||r.epoch!==o.epoch||r.baselineEpoch!==b.epoch||
      b.epoch!==c.baselineEpoch||b.kind!=="baseline"||o.kind!=="current"||!(o.date>b.date))return unavailable("Captured configuration, CRS or epoch references are inconsistent.");
    if(c.verified!==true||b.verified!==true||o.verified!==true||typeof c.bottomId!=="string"||!c.bottomId.trim()||
      !Array.isArray(r.sources)||r.sources.length!==4||r.sources.some(ref=>!ref||typeof ref!=="object"||Array.isArray(ref)||
        typeof ref.id!=="string"||!ref.id.trim()||!Number.isInteger(ref.revision)||ref.revision<1)||
      [b,o].some(source=>["top","bottom"].some(target=>
        !r.sources.some(ref=>ref.id===source.id+":"+target&&ref.revision===source.revision))))return unavailable("Captured target identities or verification declarations are incomplete.");
    if(!o.bottom||![o.bottom.eastingM,o.bottom.northingM,r.eastMm,r.northMm,r.displacementMm,r.ratio,r.angleMrad,c.heightM].every(Number.isFinite)||
      c.heightM<=0||r.displacementMm<0||r.ratio<0||r.angleMrad<0)return unavailable("Saved anchor or numerical result is invalid.");
    const zero=r.displacementMm===0;
    if(zero?(r.eastMm!==0||r.northMm!==0||r.gridAzimuthDeg!==null):(!Number.isFinite(r.gridAzimuthDeg)||r.gridAzimuthDeg<0||r.gridAzimuthDeg>=360))return unavailable("Saved direction is inconsistent or unavailable.");
    const anchor=[o.bottom.eastingM,o.bottom.northingM];
    const endpoint=[anchor[0]+scale*r.eastMm/1000,anchor[1]+scale*r.northMm/1000];
    if(!endpoint.every(Number.isFinite))return unavailable("Display endpoint exceeds the supported numerical range.");
    try{
      const a=project(...anchor),e=project(...endpoint);
      if([a,e].some(p=>!p||![p.lat,p.lng].every(Number.isFinite)||Math.abs(p.lat)>90||Math.abs(p.lng)>180))return unavailable("Coordinate projection unavailable or invalid.");
      return {status:"AVAILABLE",anchor,endpoint,geo:{anchor:a,endpoint:e},zero,historical,scale};
    }catch{return unavailable("Coordinate projection unavailable or failed.");}
  }
  return {build};
});
