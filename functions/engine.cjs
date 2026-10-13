// Exact game movement engine; tests compare this block with index.html.
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const inB=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
function initBoard(){const b=new Array(64).fill(0);for(let c=0;c<8;c++){b[8+c]=1;b[16+c]=1;b[40+c]=-1;b[48+c]=-1}return b}
function capDFS(b,fr,fc,r,c,p,king,side,last,steps,caps,out){let found=false;const dirs=king?DIRS:[[side,0],[0,1],[0,-1]];
  for(const d of dirs){if(last&&d[0]===-last[0]&&d[1]===-last[1])continue;
    if(!king){const r1=r+d[0],c1=c+d[1],r2=r+2*d[0],c2=c+2*d[1];if(!inB(r2,c2))continue;const v=b[r1*8+c1];if(v*side<0&&b[r2*8+c2]===0){found=true;b[r1*8+c1]=0;b[r*8+c]=0;b[r2*8+c2]=p;capDFS(b,fr,fc,r2,c2,p,king,side,d,steps.concat([[r2,c2]]),caps.concat([[r1,c1]]),out);b[r2*8+c2]=0;b[r*8+c]=p;b[r1*8+c1]=v}}
    else{let rr=r+d[0],cc=c+d[1];while(inB(rr,cc)&&b[rr*8+cc]===0){rr+=d[0];cc+=d[1]}if(!inB(rr,cc)||b[rr*8+cc]*side>0)continue;const er=rr,ec=cc,v=b[er*8+ec];let lr=er+d[0],lc=ec+d[1];
      while(inB(lr,lc)&&b[lr*8+lc]===0){found=true;b[er*8+ec]=0;b[r*8+c]=0;b[lr*8+lc]=p;capDFS(b,fr,fc,lr,lc,p,king,side,d,steps.concat([[lr,lc]]),caps.concat([[er,ec]]),out);b[lr*8+lc]=0;b[r*8+c]=p;b[er*8+ec]=v;lr+=d[0];lc+=d[1]}}}
  if(!found&&caps.length)out.push({from:[fr,fc],steps,caps})}
function genMoves(b,side){let caps=[],maxN=0;
  for(let i=0;i<64;i++){const p=b[i];if(p*side<=0)continue;const r=i>>3,c=i&7,out=[];capDFS(b.slice(),r,c,r,c,p,Math.abs(p)===2,side,null,[],[],out);for(const s of out){if(s.caps.length>maxN){maxN=s.caps.length;caps=[s]}else if(s.caps.length===maxN)caps.push(s)}}
  if(maxN>0)return caps;const mv=[];
  for(let i=0;i<64;i++){const p=b[i];if(p*side<=0)continue;const r=i>>3,c=i&7,king=Math.abs(p)===2;const dirs=king?DIRS:[[side,0],[0,1],[0,-1]];
    for(const d of dirs){let rr=r+d[0],cc=c+d[1];while(inB(rr,cc)&&b[rr*8+cc]===0){mv.push({from:[r,c],steps:[[rr,cc]],caps:[]});if(!king)break;rr+=d[0];cc+=d[1]}}}
  return mv}
function applyMove(b,m,side){const nb=b.slice();const[fr,fc]=m.from;let p=nb[fr*8+fc];nb[fr*8+fc]=0;for(const[r,c]of m.caps)nb[r*8+c]=0;const[tr,tc]=m.steps[m.steps.length-1];if(Math.abs(p)===1&&(side===1&&tr===7||side===-1&&tr===0))p=2*side;nb[tr*8+tc]=p;return nb}
module.exports={initBoard,genMoves,applyMove};
