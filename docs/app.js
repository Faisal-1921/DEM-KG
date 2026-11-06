'use strict';
(async()=>{
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const tag=(v,w=false)=>`<span class="tag ${w?'warm':''}">${esc(v)}</span>`;
 const label=k=>k.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
 const present=(v)=>v==null?'<span class=\"muted\">Not specified</span>':Array.isArray(v)?(v.length?'<ul class=\"science-list\">'+v.map(x=>'<li>'+present(x)+'</li>').join('')+'</ul>':'<span class=\"muted\">None recorded</span>'):typeof v==='object'?'<dl class=\"field-list\">'+Object.entries(v).map(([k,x])=>'<dt>'+esc(label(k))+'</dt><dd>'+present(x)+'</dd>').join('')+'</dl>':'<span class=\"field-value\">'+esc(v)+'</span>';
 const raw=(title,v)=>`<details><summary>${esc(title)}</summary>${present(v)}</details>`;
 const button=(kind,id,title)=>`<button data-${kind}="${esc(id)}">${esc(title)}</button>`;
 const g=await KG42.get('index');KG42.configure(g.assets);
 const sourceRecords=await KG42.get('source-record-index');
 const nodes=new Map(g.nodes.map(n=>[n.id,n])),papers=new Map(g.papers.map(p=>[p.id,p]));
 const edges=new Map(g.edges.map(e=>[e.id,e]));
 let selected=null,selectedEdge=null,slice=null,projection=null,shownNodes=[],shownEdges=[],positions={},dimensions={width:1000,height:700},epoch=0,scalePercent=100;
 const name=id=>nodes.get(id)?.label||id,code=id=>nodes.get(id)?.display_code||id;
 const rec=(kind,id)=>KG42.get(g.record_keys[kind][id]);
 const viewType=()=>$('view').value==='global'?'global':$('slice-kind').value;
 function show(html){$('detail').innerHTML=html;$('inspector').scrollTop=0;wire();}
 function error(e){show('<div class="error">'+esc(e.message)+'</div>');console.error(e);}
 function wire(){
  for(const el of $('detail').querySelectorAll('[data-node]'))el.onclick=()=>showNode(el.dataset.node).catch(error);
  for(const el of $('detail').querySelectorAll('[data-edge]'))el.onclick=()=>showEdge(el.dataset.edge).catch(error);
  for(const el of $('detail').querySelectorAll('[data-chain]'))el.onclick=()=>openSlice('chain',el.dataset.chain).catch(error);
  for(const el of $('detail').querySelectorAll('[data-rule]'))el.onclick=()=>showRule(el.dataset.rule).catch(error);
  for(const el of $('detail').querySelectorAll('[data-cluster]'))el.onclick=()=>openSlice('cluster',el.dataset.cluster).catch(error);
  for(const el of $('detail').querySelectorAll('[data-family]'))el.onclick=()=>showFamily(el.dataset.family).catch(error);
  for(const el of $('detail').querySelectorAll('[data-assertion]'))el.onclick=()=>showAssertion(el.dataset.assertion).catch(error);
 }
 function links(ids,kind='node'){return '<div class="clickable-list">'+ids.map(id=>button(kind,id,kind==='node'?code(id)+' · '+name(id):id)).join('')+'</div>';}
 function fields(value){return '<dl class="field-list">'+Object.entries(value).filter(([,v])=>v!=null&&v!=='').map(([k,v])=>`<dt>${esc(k)}</dt><dd class="field-value">${(typeof v==='string'?esc(v):present(v))}</dd>`).join('')+'</dl>';}
 function provenance(pointer){return `<details><summary>Record trace</summary><p class="code">${esc(pointer)}</p><p class="source-pointer">KG4.1 SHA-256: ${esc(g.baseline_sha256)}</p></details>`;}
 function sourceRecord(section,id){const s=g.source_record_index[section][id];return `<details><summary>Source reference</summary><p>${esc(s.document.split('/').pop())}</p><p class="code">${esc(s.pointer)}</p><p class="source-pointer">Original SHA-256: ${esc(s.original_sha256)}</p></details>`;}
 function updateSliceOptions(){
  const view=viewType(),paper=$('paper').value,old=$('slice').value;
  $('template-control').hidden=view!=='global';$('search-control').hidden=view!=='global';$('paper-control').hidden=view==='global';
  $('slice-control').hidden=view==='global';$('slice-kind-control').hidden=view==='global';if(view==='global')return;
  const list=(view==='chain'?g.chains.filter(c=>c.visible):g.clusters).filter(c=>paper==='all'||c.paper===paper);
  $('slice').innerHTML=list.map(c=>`<option value="${esc(c.id)}">${esc(papers.get(c.paper).number+' · '+c.id.split('::').pop()+' · '+c.title+(c.status==='original_singleton'?' [single-node rule]':''))}</option>`).join('');
  if(list.some(c=>c.id===old))$('slice').value=old;
 }
 async function refresh(inspect=true){
  const token=++epoch;updateSliceOptions();const view=viewType(),selectedSlice=$('slice').value;
  slice=null;
  if(view!=='global'&&selectedSlice){
   const item=(view==='chain'?g.chains:g.clusters).find(c=>c.id===selectedSlice);
   const loaded=await KG42.get(item.key);if(token!==epoch)return;slice=loaded;
  }
  projection=KG42View.project(g,slice,{paper:$('paper').value,family:$('template').value,query:$('search').value});
  shownNodes=projection.nodes;shownEdges=projection.edges;
  const lostInspection=(selected&&!projection.highlighted_node_ids.includes(selected))||(selectedEdge&&!projection.highlighted_edge_ids.includes(selectedEdge));
  if(selected&&!projection.highlighted_node_ids.includes(selected))selected=null;
  if(selectedEdge&&!projection.highlighted_edge_ids.includes(selectedEdge))selectedEdge=null;
  $('summary').textContent=slice||$('template').value!=='all'?`${projection.highlighted_node_ids.length} nodes · ${projection.highlighted_edge_ids.length} edges`:'338 nodes · 477 edges';
  $('graph-title').textContent=slice?(view==='chain'?'Rule-Chain':'Rule-Cluster')+' · '+slice.id.split('::').pop():($('template').value==='all'?'Rule graph':g.families.find(f=>f.id===$('template').value)?.english_name);
  layout();draw();inspectOptions(selected?'node':selectedEdge?'edge':null,selected||selectedEdge||'');if(inspect){if(slice)await showSlice(slice,view);else showGuide();}else if(lostInspection)showGuide();
 }
 function layout(){positions=g.layout.positions;dimensions={width:g.layout.width,height:g.layout.height};}
 // Shared face gradients keep the registered layer hue while adding directional light.
 function shade(hex,amount){
  const raw=hex.slice(1),h=raw.length===3?raw.split('').map(c=>c+c).join(''):raw,n=parseInt(h,16),target=amount>=0?255:0,a=Math.abs(amount);
  return '#'+[16,8,0].map(shift=>Math.round(((n>>shift)&255)*(1-a)+target*a).toString(16).padStart(2,'0')).join('');
 }
 function cubePaints(){
  return [...g.layers.map(l=>l.color),'#c7cdd1'].map((color,i)=>[
   ['top',.68,.24],['left',.15,-.12],['right',-.19,-.43]
  ].map(([face,light,dark])=>`<linearGradient id="cube-${i}-${face}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${shade(color,light)}"/><stop offset="100%" stop-color="${shade(color,dark)}"/></linearGradient>`).join('')).join('');
 }
 function draw(){
  const stage=$('stage'),viewport={left:stage.scrollLeft,top:stage.scrollTop};
  const W=dimensions.width,H=dimensions.height;
  let svg='<defs><marker id="arrow-active" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#267a91"/></marker><marker id="arrow-context" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#b2bac0"/></marker><marker id="arrow-selected" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#ad571e"/></marker></defs>';
  svg=svg.replace('</defs>',cubePaints()+'</defs>');
  for(const p of g.layout.planes){svg+=`<g><path class="plane" d="M35,${p.y} L${W-85},${p.y} L${W-35},${p.y+p.height} L85,${p.y+p.height}Z"/><text x="40" y="${p.y+24}" class="layer-label" fill="${esc(p.color)}">${esc(p.number+' '+p.code)}</text></g>`;}
  for(const f of g.layout.groups){
   const [x,y,w,h]=f.box,ref=g.families.find(a=>a.id===f.id),canSelect=viewType()==='global',active=canSelect&&$('template').value===f.id;
   svg+=`<g class="template-region ${active?'selected-template':''}" ${canSelect?`data-template="${esc(f.id)}" tabindex="0" role="button" aria-pressed="${active}" aria-label="Select template ${esc(ref?.english_name||f.code)}"`:''}><rect class="template-box" x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${esc(f.color)}" fill-opacity="${active?.10:.025}" stroke="${esc(f.color)}" stroke-opacity="${active?.9:.3}" stroke-width="${active?2:1}"/><rect x="${x}" y="40" width="${w}" height="58" fill="transparent"/><text class="template-label" x="${x+w/2}" y="67" text-anchor="middle" fill="${esc(f.color)}">${esc(ref?.display_code||f.code)}</text><text x="${x+w/2}" y="90" font-size="12" text-anchor="middle">${esc(ref?.english_name||'')}</text></g>`;
  }
  const path=(s,t,i)=>{
   const a=positions[s],b=positions[t];if(s===t)return `M${a.x-10},${a.y-16} C${a.x-62},${a.y-85} ${a.x+62},${a.y-85} ${a.x+12},${a.y-16}`;
   const dy=b.y-a.y,dx=b.x-a.x,L=Math.hypot(dx,dy)||1,sx=a.x+dx/L*25,sy=a.y+dy/L*25,tx=b.x-dx/L*28,ty=b.y-dy/L*28;
   return `M${sx},${sy} Q${(sx+tx)/2+(i%3-1)*18},${(sy+ty)/2-(Math.abs(dy)<30?50:0)} ${tx},${ty}`;
  };
  const ordered=shownEdges.map((e,i)=>({...e,drawIndex:i})).sort((a,b)=>Number(a.highlighted)-Number(b.highlighted)||Number(a.id===selectedEdge)-Number(b.id===selectedEdge));
  ordered.forEach(e=>{
   const incident=e.source===selected||e.target===selected,isSelected=e.id===selectedEdge;
   const color=isSelected?'#ad571e':e.highlighted?'#267a91':'#b2bac0',marker=isSelected?'selected':e.highlighted?'active':'context';
   const count=e.inspection_assertion_ids.length,scope=e.highlighted?'Highlighted selection':'Gray global context; outside selection';
   svg+=`<g class="edge ${e.highlighted?'highlighted-edge':'context-edge'} ${isSelected?'selected-edge':''}" ${e.highlighted?`data-edge="${esc(e.id)}" tabindex="0" role="button" aria-label="${esc(code(e.source)+' to '+code(e.target)+'; '+scope)}"`:'aria-hidden="true"'}><title>${esc(name(e.source)+' → '+name(e.target)+' · '+count+' source assertions · '+scope)}</title><path class="edge-line" d="${path(e.source,e.target,e.drawIndex)}" stroke="${color}" stroke-width="${isSelected||incident?2.4:e.highlighted?1.5:.8}" opacity="${isSelected?1:e.highlighted?.7:.38}" fill="none" marker-end="url(#arrow-${marker})" vector-effect="non-scaling-stroke"/>${e.highlighted?`<path class="edge-hit" d="${path(e.source,e.target,e.drawIndex)}" stroke="transparent" stroke-width="10" fill="none" pointer-events="stroke" vector-effect="non-scaling-stroke"/>`:''}</g>`;
  });
  for(const n of [...shownNodes].sort((a,b)=>Number(a.highlighted)-Number(b.highlighted))){
   const p=positions[n.id],l=g.layers.find(l=>l.id===n.layer),base=n.highlighted?l.color:'#c7cdd1',paint=n.highlighted?g.layers.findIndex(x=>x.id===n.layer):g.layers.length;
   svg+=`<g class="figure-node ${n.highlighted?'highlighted-node':'context-node'} ${selected===n.id?'selected':''}" transform="translate(${p.x},${p.y})" ${n.highlighted?`data-node="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.display_code+' '+n.label)}"`:'aria-hidden="true"'}><title>${esc(n.display_code+' · '+n.code+' · '+n.label+(n.highlighted?'':' · Background only'))}</title><rect class="halo" x="-50" y="-33" width="100" height="84" rx="8"/><ellipse class="cube-shadow" cx="4" cy="31" rx="25" ry="5" fill="#1b3647" opacity="${n.highlighted?.14:.05}"/><g class="cube-body"><path class="cube-top" d="M0,-22 L24,-9 L0,4 L-24,-9Z" fill="url(#cube-${paint}-top)"/><path class="cube-left" d="M-24,-9 L0,4 L0,28 L-24,15Z" fill="url(#cube-${paint}-left)"/><path class="cube-right" d="M0,4 L24,-9 L24,15 L0,28Z" fill="url(#cube-${paint}-right)"/><path class="cube-outline" d="M0,-22 L24,-9 V15 L0,28 L-24,15 V-9Z" fill="none" stroke="${shade(base,-.35)}" stroke-width=".8" stroke-linejoin="round"/><path d="M-24,-9 L0,4 L24,-9 M0,4 V28" fill="none" stroke="#fff" stroke-opacity=".48" stroke-width=".85"/><path d="M-19,-9 L0,-19 L18,-9" fill="none" stroke="#fff" stroke-opacity=".65" stroke-width=".7"/></g><text y="46" text-anchor="middle" class="node-label">${esc(n.display_code)}</text></g>`;
  }
  $('canvas').setAttribute('viewBox',`0 0 ${W} ${H}`);$('canvas').innerHTML=svg;renderScale();stage.scrollLeft=viewport.left;stage.scrollTop=viewport.top;
  for(const el of $('canvas').querySelectorAll('[data-template]')){el.onclick=()=>selectTemplate(el.dataset.template).catch(error);el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};}
  for(const el of $('canvas').querySelectorAll('[data-node]')){el.onclick=()=>showNode(el.dataset.node).catch(error);el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};}
  for(const el of $('canvas').querySelectorAll('[data-edge]')){el.onclick=()=>showEdge(el.dataset.edge).catch(error);el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.click();}};}
 }
 async function selectTemplate(id){
  if(viewType()!=='global'||!g.families.some(f=>f.id===id))return;
  $('template').value=id;selected=null;selectedEdge=null;
  await refresh();updateHash();
 }
 function renderScale(){
  const scale=scalePercent/100;
  $('canvas').style.width=dimensions.width*scale+'px';$('canvas').style.height=dimensions.height*scale+'px';
  $('zoom').value=String(scalePercent);$('zoom').setAttribute('aria-valuetext',scalePercent+'%');
  $('zoom-percent').textContent=scalePercent+'%';
 }
 function setScale(value,keepCenter=true){
  const stage=$('stage'),previous=scalePercent/100;
  const x=(stage.scrollLeft+stage.clientWidth/2)/previous,y=(stage.scrollTop+stage.clientHeight/2)/previous;
  scalePercent=Math.max(5,Math.min(200,Math.round(Number(value)||100)));renderScale();
  if(keepCenter){stage.scrollLeft=Math.max(0,x*scalePercent/100-stage.clientWidth/2);stage.scrollTop=Math.max(0,y*scalePercent/100-stage.clientHeight/2);}
 }
 function fit(){
  const stage=$('stage'),scale=Math.min((stage.clientWidth-25)/dimensions.width,(stage.clientHeight-25)/dimensions.height,1);
  setScale(Math.floor(scale*100),false);stage.scrollTop=0;stage.scrollLeft=0;
 }
 function inspectOptions(kind=null,id=''){
  const nodeOptions=projection.nodes.filter(n=>n.highlighted).map(n=>`<option value="node:${esc(n.id)}">${esc(n.display_code+' · '+n.label)}</option>`).join('');
  const edgeOptions=projection.edges.filter(e=>e.highlighted).map(e=>`<option value="edge:${esc(e.id)}">${esc(code(e.source)+' → '+code(e.target))}</option>`).join('');
  $('inspect-entry').innerHTML='<option value="">Select a node or edge…</option>'+(nodeOptions?'<optgroup label="Nodes">'+nodeOptions+'</optgroup>':'')+(edgeOptions?'<optgroup label="Edges">'+edgeOptions+'</optgroup>':'');
  $('inspect-entry').value=kind&&id?kind+':'+id:'';
  $('quick-inspect').hidden=!nodeOptions&&!edgeOptions;
 }
 function updateHash(kind,id){const h=new URLSearchParams();if(slice)h.set(viewType(),slice.id);else if($('template').value!=='all')h.set('template',$('template').value);if(kind&&id)h.set(kind,id);history.replaceState(null,'','#'+h.toString());}
 function evidence(paper,entries){
  return (entries||[]).map(e=>{const refs=sourceRecords.evidence[paper]?.[e.evidence_id];return `<details><summary>${esc(e.evidence_id||'Source excerpt')}</summary><blockquote>${esc(e.source_text||e.quote||'')}</blockquote>${raw('Location',e.location||{})}${refs?refs.pointers.map(p=>`<p class="source-pointer">${esc(refs.document.split('/').pop())} · ${esc(p)}</p>`).join(''):''}</details>`;}).join('');
 }
 function constraint(c,paper,status=''){
  return `<div class="entry">${tag(c.constraint_id)}${status?tag(status,status==='Held'):''}<p>${esc(c.statement||'')}</p>${c.expression?`<div class="formula" aria-label="Source mathematical expression">${esc(c.expression)}</div>`:''}${fields({'Form':c.kind,'Formalization':c.formalization_origin,'Variable references':c.variable_refs,'Parameter references':c.parameter_refs})}${evidence(paper,c.evidence||[])}</div>`;
 }
 async function showFamily(id){
  const f=await rec('functional_groups',id);show(tag('Functional group')+tag(f.code)+tag(f.layer)+`<h2>Existing functional children</h2><p>${esc(f.definition)}</p><p>This group provides context for the current nodes below. It adds no node or relation to the global graph.</p>`+links(f.child_ids));
 }
 async function showNode(id){
  if(!projection.highlighted_node_ids.includes(id))return;selected=id;selectedEdge=null;draw();inspectOptions('node',id);const n=await rec('nodes',id),brief=nodes.get(id);updateHash('node',id);
  let html=tag(brief.display_code)+tag(brief.code)+tag(n.layer)+tag(brief.template_code)+`<h2>${esc(brief.label)}</h2><p>${esc(n.definition)}</p>`;
  html+=fields({'Stable node ID':id,'Source occurrences':n.members.length,'Source papers':n.paper_ids.length});
  const incident=projection.edges.filter(e=>e.highlighted&&(e.source===id||e.target===id));
  html+='<h3>Incoming and outgoing S edges</h3><div class="clickable-list">'+incident.map(e=>button('edge',e.id,code(e.source)+' → '+code(e.target))).join('')+'</div>';
  if(n.functional.is_child){const f=g.functional_groups.find(f=>f.id===n.functional.baseline_parent_id);html+=`<section class="mapping-panel"><h3>Functional child · ${esc(n.functional.baseline_parent_code)}</h3>${button('family',f.id,'Open functional group')}${links(f.child_ids)}<p>These are the current members of this existing functional group.</p></section>`;}
  if(n.functional.subdivision_pending)html+='<p class="notice">Further functional subdivision remains unresolved. The current source definitions and memberships are retained.</p>';
  html+=raw('Definition: object, inputs, operation and boundary',n.semantic_definition);
  if(n.source_parent_definition)html+=raw('Additional source-based definition',n.source_parent_definition);
  if(n.functional.category?.definition_zh)html+=`<details><summary>Functional category and scope</summary><p>${esc(n.functional.category.definition_zh)}</p>${raw('Inclusion conditions',n.functional.category.inclusion_criteria)}${raw('Exclusion conditions',n.functional.category.exclusion_criteria)}</details>`;
  html+='<h3>Source definitions and mathematics</h3><p>Each card retains its own paper, mechanism, scope and variables. A formula is not automatically valid for every member of this node.</p>';
  for(const u of n.source_units){
   const definitions=n.source_definitions.filter(d=>d.unit_id===u.unit_id),variants=n.source_variants.filter(d=>d.unit_id===u.unit_id);
   html+=`<details class="source-unit"><summary>${esc(papers.get(u.paper_id)?.number+' · '+u.function+' · '+u.mechanism_id)}</summary>`;
   for(const d of definitions)html+=`<p>${esc(d.target_definition)}</p>${raw('Identity and source-specific variants',{identity:d.identity_fields,variants:d.variation_fields})}`;
   for(const v of variants)html+=`${v.source_definition?`<p>${esc(v.source_definition)}</p>`:''}${raw('Retained source conditions and variants',v.retained_variants||[])}`;
   for(const c of u.constraints||[])html+=constraint(c,u.paper_id);
   html+=raw('Variables and units',u.variables)+raw('Parameters and units',u.parameters);
   html+='<h4>Exact source rule occurrences</h4>';
   for(const m of u.source_occurrences||[]){const rule=u.paper_id+'::'+m.rule_id;html+=`<div class="entry">${button('rule',rule,m.rule_id)}<p>${esc(m.market_meaning)}</p>${raw('Applicability',m.omega)}${fields({'Occurrence ID':m.id,'Constraint references':m.constraint_refs})}</div>`;}
   html+='</details>';
  }
  html+='<h3>Source Rule-Chains</h3>'+links(brief.rule_refs,'chain')+raw('Additional source evidence',n.evidence)+raw('Definition boundaries',n.exclusions)+provenance(n.canonical_pointer);show(html);
 }
 async function assertionCard(a){
  const accepted=new Set(a.accepted_constraint_ids||[]),held=new Set(a.held_constraint_ids||[]),science=a.source_science||{};
  let html=tag(a.active?'Active S assertion':'Quarantined assertion',!a.active)+tag(papers.get(a.paper).number)+tag(a.semantic_review_status)+`<p>${button('rule',a.rule_ref,a.rule_id)}</p>`;
  html+=fields({'Source occurrence':a.source_occurrence_id,'Target occurrence':a.target_occurrence_id,'Original endpoints':a.record.source+' → '+a.record.target});
  html+=raw('Scope and applicability',a.omega);
  if(science.source_definition||science.target_definition)html+=raw('Source-specific endpoint definitions',{'Source':science.source_definition,'Target':science.target_definition});
  for(const c of science.constraints||[])html+=constraint(c,a.paper,accepted.has(c.constraint_id)?'Accepted within source scope':held.has(c.constraint_id)?'Held':'Source statement');
  html+=evidence(a.paper,science.evidence||[])+raw('Accepted and held constraint references',{accepted:a.accepted_constraint_ids,held:a.held_constraint_ids});
  const sourceRule=await rec('rules',a.rule_ref);
  const [sn,tn]=await Promise.all([rec('nodes',a.source),rec('nodes',a.target)]);
  const endpoint=(n,uid)=>n.source_definitions.filter(d=>d.unit_id===uid).map(d=>d.target_definition);
  html+=raw('Definitions from exact endpoint units',{'Source':endpoint(sn,a.source_unit_id),'Target':endpoint(tn,a.target_unit_id)});
  html+=`<details><summary>Source rule context: meaning, formulas and units</summary><p>${esc(sourceRule.record.market_meaning)}</p><p>These expressions belong to the source rule. Only explicitly accepted references above are attributed to this assertion.</p>`;
  for(const c of sourceRule.record.phi||[])html+=constraint(c,a.paper);
  html+=raw('Source rule variables and units',sourceRule.record.x)+raw('Source rule parameters and units',sourceRule.record.theta)+'</details>';
  html+=sourceRecord('rules',a.rule_ref);return html;
 }
 async function showEdge(id){
  const scope=KG42View.edgeScope(projection,id);if(!scope.ids.length)return;selected=null;selectedEdge=id;draw();inspectOptions('edge',id);updateHash('edge',id);
  const e=await rec('edges',id),allowed=new Set(scope.ids),as=e.assertions.filter(a=>allowed.has(a.id));
  show(tag('S · highlighted source relation')+`<h2>${esc(code(e.source))} → ${esc(code(e.target))}</h2>`+links([e.source,e.target])+`<p>${as.length} source assertion(s).</p><p class="notice">Only source assertions belonging to the current highlighted selection are shown below.</p>`+(await Promise.all(as.map(async a=>'<section class="source-unit">'+await assertionCard(a)+'</section>'))).join(''));

 }
 async function showAssertion(id){const a=await rec('source_edge_archive',id);show(`<h2>${esc(code(a.source))} → ${esc(code(a.target))}</h2>`+links([a.source,a.target])+await assertionCard(a));}
 async function showRule(id){
  const item=await rec('rules',id),r=item.record,c=g.chains.find(x=>x.id===id);
  let html=tag(papers.get(item.paper).number)+tag(c.status,c.status!=='visible')+`<h2>${esc(r.name)}</h2><p>${esc(r.market_meaning)}</p>`+sourceRecord('rules',id);
  if(c.visible)html+=button('chain',id,'Open current-node slice');else html+='<p class="notice">The original rule is preserved. Its chain display is cancelled because its original nodes map to one current node.</p>';
  html+=links(c.node_ids)+raw('Scope and applicability',r.omega)+'<h3>Constraints and formulas</h3>';
  for(const c of r.phi||[])html+=constraint(c,item.paper);
  html+=raw('Variables and units',r.x)+raw('Parameters and units',r.theta)+'<h3>Source evidence</h3>'+evidence(item.paper,r.pi||[]);
  html+=raw('Source field notes and unresolved references',{notes:r.field_notes,quarantined_references:r.quarantined_references});show(html);
 }
 async function showSlice(s,view){
  let html=tag(view==='chain'?'Rule-Chain':'Rule-Cluster')+tag(papers.get(s.paper).number)+`<h2>${esc(s.title)}</h2><p class="code">${esc(s.id)}</p>`;
  if(view==='chain'){
   const r=await rec('rules',s.id);html+=`<p>${esc(r.record.market_meaning)}</p>`;
   if(s.status==='original_singleton')html+='<p class="notice">This source rule originally contained one node and remains available as a single-node rule.</p>';
   html+=button('rule',s.id,'Definitions, formulas and evidence')+sourceRecord('rules',s.id)+links(s.node_ids)+raw('Exact occurrence mapping',s.occurrence_mappings);
   if(s.quarantined_assertion_ids.length)html+='<h3>Quarantined source assertions</h3>'+s.quarantined_assertion_ids.map(a=>button('assertion',a,a.split('::').pop())).join('');
  }else{
   const c=await rec('clusters',s.id),r=c.record;html+=`<p>${esc(r.market_meaning)}</p>`+sourceRecord('clusters',s.id);
   html+=raw('Cluster scope',{disposition:r.scope_disposition,explanation:r.scope_explanation,status:r.assembly_status,boundary:r.boundary_rationale});
   html+='<h3>Source Rule-Chains</h3>'+links(s.visible_rule_refs,'chain');
   if(s.suppressed_rule_refs.length)html+='<h3>Preserved rules without a chain display</h3>'+s.suppressed_rule_refs.map(x=>button('rule',x.id,x.id.split('::').pop())).join('');
   html+=raw('Chain ownership and roles',r.chain_bindings)+raw('D interfaces — annotations, not additional S edges',s.interface_annotations)+raw('Source object correspondences',r.object_mappings)+raw('Source gaps and unresolved references',{gaps:r.gaps,unresolved:s.unresolved_rule_refs});
  }
  show(html);
 }
 async function openSlice(view,id){
  const c=(view==='chain'?g.chains:g.clusters).find(c=>c.id===id);if(!c)throw Error('Unknown source slice '+id);
  if(view==='chain'&&!c.visible){await showRule(id);return;}
  $('view').value='slices';$('slice-kind').value=view;$('paper').value=c.paper;$('template').value='all';$('search').value='';updateSliceOptions();$('slice').value=id;
  history.replaceState(null,'','#'+view+'='+encodeURIComponent(id));await refresh();
 }
 function showGuide(){
  const message=$('template').value==='all'?'Choose a template to explore.':'Select a colored node or edge.';
  show('<div class="empty-detail"><p>'+message+'</p></div>');
 }
 $('template').innerHTML='<option value="all">Select a template…</option>'+g.families.map(f=>`<option value="${esc(f.id)}">${esc(f.display_code+' · '+f.english_name)}</option>`).join('');
 $('paper').innerHTML='<option value="all">All 50 papers</option>'+g.papers.map(p=>`<option value="${esc(p.id)}">${esc(p.number+' · '+p.title)}</option>`).join('');
 for(const id of ['slice-kind','paper','slice'])$(id).onchange=()=>refresh().catch(error);
 $('template').onchange=()=>{selected=null;selectedEdge=null;refresh().then(()=>updateHash()).catch(error);};
 $('view').onchange=()=>{
  $('paper').value='all';$('template').value='all';$('search').value='';selected=null;selectedEdge=null;$('quick-inspect').open=false;
  history.replaceState(null,'',location.pathname);refresh().catch(error);
 };
 $('search').oninput=()=>refresh(false).catch(error);$('zoom').oninput=()=>setScale($('zoom').value);$('fit').onclick=fit;
 $('inspect-entry').onchange=()=>{
  const value=$('inspect-entry').value,separator=value.indexOf(':');if(separator<0)return;
  const kind=value.slice(0,separator),id=value.slice(separator+1);$('quick-inspect').open=false;
  (kind==='node'?showNode(id):showEdge(id)).catch(error);
 };
 const hash=new URLSearchParams(location.hash.slice(1));
 if(g.families.some(f=>f.id===hash.get('template')))$('template').value=hash.get('template');
 await refresh();
 if(hash.has('chain'))await openSlice('chain',hash.get('chain'));
 else if(hash.has('cluster'))await openSlice('cluster',hash.get('cluster'));
 if(hash.has('node')&&nodes.has(hash.get('node')))await showNode(hash.get('node'));
 else if(hash.has('edge')&&edges.has(hash.get('edge')))await showEdge(hash.get('edge'));
})().catch(e=>{document.getElementById('detail').textContent='Unable to load DEM-KG: '+e.message;console.error(e);});
