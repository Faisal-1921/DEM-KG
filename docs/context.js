'use strict';
// Pure view-state projection; it never changes the graph or its source assertions.
(function(root){
 function project(g,slice,filters={}){
  const scoped=slice?new Set(slice.node_ids):null,query=(filters.query||'').trim().toLowerCase();
  const paper=filters.paper||'all',family=filters.family||'all';
  const templateReady=!!slice||family!=='all';
  const nodes=g.nodes.map(n=>({...n,highlighted:templateReady&&(!scoped||scoped.has(n.id))&&(paper==='all'||n.paper_ids.includes(paper))&&(family==='all'||n.family===family)&&(!query||[n.label,n.code,n.display_code,n.id].some(x=>String(x).toLowerCase().includes(query)))}));
  const highlighted=new Set(nodes.filter(n=>n.highlighted).map(n=>n.id));
  const sliceEdges=new Map((slice?.edges||[]).map(e=>[e.global_edge_id,new Set(e.assertion_ids)]));
  const edges=g.edges.map(e=>{
   const allowed=slice?sliceEdges.get(e.id):new Set(e.assertion_ids);
   const ids=allowed&&highlighted.has(e.source)&&highlighted.has(e.target)?e.assertions.filter(a=>allowed.has(a.id)&&(paper==='all'||a.paper===paper)).map(a=>a.id):[];
   return {...e,highlighted:ids.length>0,highlighted_assertion_ids:ids,
    inspection_assertion_ids:ids,
    inspection_scope:ids.length?(slice?'slice':'global_selection'):'global_background'};
  });
  return {nodes,edges,positions:g.layout.positions,width:g.layout.width,height:g.layout.height,
   highlighted_node_ids:[...highlighted],highlighted_edge_ids:edges.filter(e=>e.highlighted).map(e=>e.id),
   highlighted_assertion_count:edges.reduce((n,e)=>n+e.highlighted_assertion_ids.length,0)};
 }
 function edgeScope(state,id){const e=state.edges.find(e=>e.id===id);if(!e)throw Error('Unknown edge '+id);return {ids:e.inspection_assertion_ids,scope:e.inspection_scope};}
 const api={project,edgeScope};root.KG42View=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
