import type { SubjectId } from "./protocol.js";
export interface PracticeQuestion {
  id: string; subjectId: SubjectId; topic: string; difficulty: number;
  kind: "number" | "roots" | "choice" | "text";
  stem: string; options: string[]; source: string;
}
export interface SolvedQuestion extends PracticeQuestion { answer: string; explanation: string }
interface Template {
  id: string; subjectId: SubjectId; topic: string; difficulty: number;
  count: number; make: (index: number) => Pick<SolvedQuestion,"stem"|"answer"|"explanation"> & Partial<Pick<SolvedQuestion,"kind"|"options">>;
}
const source = "ONclasstime 原创可计算变式 · v1（非历年真题）";
const round = (x: number) => Number(x.toFixed(3)).toString();
const mixed = (i: number, sizes: number[]) => sizes.map(n => { const v=i%n; i=Math.floor(i/n); return v; });
const signed = (n: number) => n < 0 ? ` − ${Math.abs(n)}` : ` + ${n}`;
const gcd = (a: number,b: number):number => b ? gcd(b,a%b) : Math.abs(a);
const fraction = (a:number,b:number) => {const d=gcd(a,b);return b/d===1?String(a/d):`${a/d}/${b/d}`};
const pairs:number[][]=[];for(let a=-20;a<=20;a++)for(let b=a+1;b<=20;b++)pairs.push([a,b]);
const resistors:number[][]=[];for(let a=1;a<=30;a++)for(let b=a;b<=30;b++)resistors.push([a,b]);
const compounds:[string,number][]=[["H2O",18],["CO2",44],["O2",32],["H2",2],["NaCl",58.5],["CaCO3",100],["NaOH",40],["H2SO4",98],["CH4",16],["NH3",17],["C2H5OH",46],["MgO",40],["Al2O3",102],["Fe2O3",160],["CuO",80],["Na2CO3",106]];
const templates:Template[]=[
 {id:"linear",subjectId:"math",topic:"一元一次方程",difficulty:1,count:20*41*41,make:i=>{const [aa,bb,xx]=mixed(i,[20,41,41]),a=aa+1,b=bb-20,x=xx-20,c=a*x+b;return {stem:`解方程：${a}x${signed(b)} = ${c}。`,answer:String(x),explanation:`两边减去 ${b}，得到 ${a}x = ${c-b}；再除以 ${a}，x = ${x}。`}}},
 {id:"quadratic",subjectId:"math",topic:"一元二次方程",difficulty:2,count:pairs.length*5,make:i=>{const [pi,ai]=mixed(i,[pairs.length,5]),[r,s]=pairs[pi],a=ai+1,b=-a*(r+s),c=a*r*s;return {kind:"roots",stem:`求 ${a}x²${signed(b)}x${signed(c)} = 0 的两个实数根（用逗号分隔）。`,answer:`${r},${s}`,explanation:`左边分解为 ${a}(x${signed(-r)})(x${signed(-s)})，因此两个根是 ${r}、${s}。`}}},
 {id:"fractions",subjectId:"math",topic:"分数运算",difficulty:1,count:15*19*15,make:i=>{let [a,b,c]=mixed(i,[15,19,15]);a++;b+=2;c++;const top=a*(b+1)+c*b,bot=b*(b+1);return {stem:`计算 ${a}/${b} + ${c}/${b+1}，写出最简分数或小数。`,answer:fraction(top,bot),explanation:`通分到分母 ${bot}，分子为 ${a*(b+1)} + ${c*b} = ${top}，约分得到 ${fraction(top,bot)}。`}}},
 {id:"sequence",subjectId:"math",topic:"等差数列",difficulty:2,count:41*10*49,make:i=>{const [aa,dd,nn]=mixed(i,[41,10,49]),a=aa-20,d=dd+1,n=nn+2,value=a+(n-1)*d;return {stem:`等差数列首项为 ${a}，公差为 ${d}，求第 ${n} 项。`,answer:String(value),explanation:`aₙ = a₁ + (n−1)d = ${a} + ${n-1}×${d} = ${value}。`}}},
 {id:"function",subjectId:"math",topic:"二次函数求值",difficulty:2,count:10*11*11*11,make:i=>{const [aa,bb,cc,xx]=mixed(i,[10,11,11,11]),a=aa<5?aa-5:aa-4,b=bb-5,c=cc-5,x=xx-5,y=a*x*x+b*x+c;return {stem:`已知 f(x) = ${a}x²${signed(b)}x${signed(c)}，求 f(${x})。`,answer:String(y),explanation:`代入 x=${x}：${a}×(${x})² + (${b})×(${x}) + (${c}) = ${y}。先算平方，再乘除，最后相加。`}}},
 {id:"triangle",subjectId:"math",topic:"三角形面积",difficulty:1,count:80*50,make:i=>{const [bb,hh]=mixed(i,[80,50]),b=bb+1,h=hh+1;return {stem:`三角形的一条底边长 ${b} cm，对应的高为 ${h} cm，面积是多少 cm²？`,answer:String(b*h/2),explanation:`面积 S=底×高÷2=${b}×${h}÷2=${b*h/2} cm²。高必须对应这条底边。`}}},
 {id:"percent",subjectId:"math",topic:"百分数应用",difficulty:1,count:100*50,make:i=>{const [pp,rr]=mixed(i,[100,50]),p=(pp+1)*10,r=rr+1;return {stem:`一件商品原价 ${p} 元，按原价降低 ${r}% 后出售。现价多少元？`,answer:String(p*(100-r)/100),explanation:`现价=原价×(1−降价率)=${p}×${100-r}%=${round(p*(100-r)/100)} 元。降低 ${r}% 并不是只卖原价的 ${r}%。`}}},
 {id:"work",subjectId:"physics",topic:"功",difficulty:1,count:200*100,make:i=>{const [ff,ss]=mixed(i,[200,100]),f=ff+1,s=ss+1;return {stem:`沿运动方向施加恒力 ${f} N，物体沿力的方向移动 ${s} m。该力做功多少 J？`,answer:String(f*s),explanation:`力与位移同向，W=Fs=${f}×${s}=${f*s} J。`}}},
 {id:"ohm",subjectId:"physics",topic:"欧姆定律",difficulty:1,count:60*120,make:i=>{const [uu,rr]=mixed(i,[60,120]),u=uu+1,r=rr+1;return {stem:`一个定值电阻为 ${r} Ω，其两端电压为 ${u} V。通过电阻的电流是多少 A？保留三位小数。`,answer:round(u/r),explanation:`根据欧姆定律 I=U/R=${u}/${r}≈${round(u/r)} A。假定温度不变，电阻为理想定值电阻。`}}},
 {id:"density",subjectId:"physics",topic:"密度",difficulty:1,count:100*50,make:i=>{const [mm,vv]=mixed(i,[100,50]),m=(mm+1)*100,v=(vv+1)*10;return {stem:`某均匀物体质量为 ${m} g，体积为 ${v} cm³。密度是多少 g/cm³？保留三位小数。`,answer:round(m/v),explanation:`ρ=m/V=${m}/${v}≈${round(m/v)} g/cm³。注意本题不需要换算成 kg/m³。`}}},
 {id:"motion",subjectId:"physics",topic:"匀速直线运动",difficulty:1,count:50*100,make:i=>{const [vv,tt]=mixed(i,[50,100]),v=vv+1,t=tt+1;return {stem:`物体以 ${v} m/s 的速度做匀速直线运动，经过 ${t} s，路程是多少 m？`,answer:String(v*t),explanation:`匀速运动的路程 s=vt=${v}×${t}=${v*t} m。`}}},
 {id:"series",subjectId:"physics",topic:"串联电路",difficulty:2,count:resistors.length*20,make:i=>{const [ri,uu]=mixed(i,[resistors.length,20]),[a,b]=resistors[ri],u=uu+1;return {stem:`理想电源电压 ${u} V，${a} Ω 与 ${b} Ω 两个电阻串联，忽略导线和电源内阻。电流是多少 A？保留三位小数。`,answer:round(u/(a+b)),explanation:`串联等效电阻 R=${a}+${b}=${a+b} Ω，I=U/R≈${round(u/(a+b))} A。两电阻中的电流相同。`}}},
 {id:"power",subjectId:"physics",topic:"功率",difficulty:1,count:99*120,make:i=>{const [ww,tt]=mixed(i,[99,120]),w=(ww+1)*100,t=tt+1;return {stem:`一台机器在 ${t} s 内做功 ${w} J，平均功率是多少 W？保留三位小数。`,answer:round(w/t),explanation:`平均功率 P=W/t=${w}/${t}≈${round(w/t)} W。`}}},
 {id:"moles",subjectId:"chemistry",topic:"物质的量",difficulty:2,count:compounds.length*100,make:i=>{const [ci,nn]=mixed(i,[compounds.length,100]),[formula,m]=compounds[ci],n=(nn+1)/10;return {stem:`本题取 ${formula} 的摩尔质量为 ${m} g/mol。${round(n)} mol ${formula} 的质量是多少 g？`,answer:round(n*m),explanation:`质量 m=nM=${round(n)}×${m}=${round(n*m)} g。摩尔质量采用题设教学近似值。`}}},
 {id:"reaction",subjectId:"chemistry",topic:"限量试剂",difficulty:3,count:4*50*50,make:i=>{const [eq,aa,bb]=mixed(i,[4,50,50]),a=aa+1,b=bb+1;const equations=[{text:"2H₂ + O₂ → 2H₂O",a:"H₂",b:"O₂",c:"H₂O",ca:2,cb:1,cc:2},{text:"2Mg + O₂ → 2MgO",a:"Mg",b:"O₂",c:"MgO",ca:2,cb:1,cc:2},{text:"4Al + 3O₂ → 2Al₂O₃",a:"Al",b:"O₂",c:"Al₂O₃",ca:4,cb:3,cc:2},{text:"N₂ + 3H₂ → 2NH₃",a:"N₂",b:"H₂",c:"NH₃",ca:1,cb:3,cc:2}];const e=equations[eq],extent=Math.min(a/e.ca,b/e.cb),n=extent*e.cc;return {stem:`按 ${e.text}，给定 ${e.a} ${a} mol 和 ${e.b} ${b} mol。假定具备反应条件且限量试剂完全反应（不考虑平衡与副反应），最多生成多少 mol ${e.c}？保留三位小数。`,answer:round(n),explanation:`比较 n/化学计量数：${a}/${e.ca} 与 ${b}/${e.cb}，取较小的 ${round(extent)}。产物物质的量为该值乘 ${e.cc}，得到 ${round(n)} mol。这是题设完全反应的理论上限。`}}},
 {id:"concentration",subjectId:"chemistry",topic:"物质的量浓度",difficulty:2,count:50*50,make:i=>{const [nn,vv]=mixed(i,[50,50]),n=(nn+1)/10,v=(vv+1)/10;return {stem:`将 ${round(n)} mol 溶质配成总体积 ${round(v)} L 的溶液，其物质的量浓度是多少 mol/L？保留三位小数。`,answer:round(n/v),explanation:`c=n/V=${round(n)}/${round(v)}≈${round(n/v)} mol/L。使用的是最终溶液体积，不是加入溶剂的体积。`}}},
];
const concepts:{subjectId:SubjectId;topic:string;stem:string;correct:string;others:string[];explanation:string}[]=[
 ["细胞结构","细胞中控制物质进出边界的主要结构是？","细胞膜",["细胞核","核糖体","染色体"],"细胞膜具有选择透过性，参与控制物质进出细胞。"],
 ["细胞结构","在有氧条件下，真核细胞进行有氧呼吸的主要场所是？","线粒体",["高尔基体","液泡","细胞壁"],"线粒体是有氧呼吸的主要场所；糖酵解发生在细胞质基质。"],
 ["遗传","DNA 中与腺嘌呤 A 互补配对的碱基是？","胸腺嘧啶 T",["尿嘧啶 U","鸟嘌呤 G","胞嘧啶 C"],"在 DNA 双链中，A 与 T 配对，G 与 C 配对。"],
 ["植物生理","绿色植物细胞进行光合作用的主要细胞器是？","叶绿体",["线粒体","核糖体","中心体"],"叶绿体中的色素吸收光能，参与光合作用。植物的所有细胞并非都有叶绿体。"],
 ["生态","食物链中生产者通常属于哪类生物？","能进行光合作用等自养过程的生物",["只捕食动物的生物","只分解遗体的生物","所有真菌"],"生产者把无机物合成为有机物，为生态系统提供物质和能量来源。"],
 ["人体生理","人体肺部气体交换的主要场所是？","肺泡",["气管","鼻腔","喉"],"肺泡壁薄且周围毛细血管丰富，有利于气体扩散交换。"],
 ["人体生理","人体运输氧气的红细胞内，主要依靠哪种蛋白？","血红蛋白",["淀粉酶","抗体","胶原蛋白"],"血红蛋白可以与氧气结合，参与血液运输氧气。"],
 ["遗传","在不考虑突变的常规体细胞有丝分裂中，子细胞染色体数目通常如何变化？","与母细胞相同",["变为一半","必定翻倍","随机变化"],"有丝分裂维持亲子细胞染色体数目的稳定；DNA 在分裂前已经复制。"],
].map(([topic,stem,correct,others,explanation])=>({subjectId:"biology",topic,stem,correct,others,explanation})) as typeof concepts;
const chinese:[string,string,string,string[],string][]=[
 ["修辞","“书籍是人类进步的阶梯”主要使用了哪种修辞？","比喻",["夸张","反问","排比"],"把书籍比作阶梯，体现比喻中本体与喻体的相似点。"],
 ["修辞","把“小草探出脑袋”写进描景句，主要使用了哪种修辞？","拟人",["对偶","反问","借代"],"赋予小草人的动作，使描写更形象生动。"],
 ["标点","表示引用原话或突出特定称谓，通常使用哪组标点？","引号",["分号","顿号","问号"],"引号可以标示直接引用或需要特殊指明的词语。"],
 ["文章结构","议论文中用来证明观点的事实和道理，通常称为？","论据",["线索","悬念","景物"],"论点是观点，论据是证明观点的材料，论证是运用论据证明论点的过程。"],
 ["文章结构","记叙文中，先写结果或后发生的情节，再回头叙述，这种顺序是？","倒叙",["顺叙","说明","描写"],"倒叙调整叙事顺序，常用于设置悬念、突出重点。"],
 ["词语","“持之以恒”最贴近的意思是？","长久坚持做一件事",["马上改变方向","只追求速度","偶尔尝试一下"],"理解词语应结合语境；“恒”强调长期坚持。"],
 ["表达","把一句长句拆成几句短句时，首先应该保持什么？","原意和逻辑关系",["所有字数完全不变","标点完全不变","每句字数相同"],"句式转换重在保持原意、逻辑和语气，再调整句子结构。"],
 ["阅读方法","阅读说明文时，判断列数字的作用，最合理的做法是？","结合所说明的对象和特征分析准确性",["只回答“生动形象”","忽略具体数字","直接抄写所有数字"],"说明方法的作用需要结合具体内容，列数字常使说明更加准确、具体。"],
];
for(const [topic,stem,correct,others,explanation] of chinese)concepts.push({subjectId:"chinese",topic,stem,correct,others,explanation});
const verbs:[string,string,string,string,string][]=[
 ["play","plays","played","playing","basketball"],["visit","visits","visited","visiting","the museum"],["watch","watches","watched","watching","a documentary"],["read","reads","read","reading","a book"],["write","writes","wrote","writing","a letter"],["clean","cleans","cleaned","cleaning","the room"],["open","opens","opened","opening","the window"],["paint","paints","painted","painting","a picture"],
];
for(const [base,third,past,ing,object] of verbs)for(const [who,singular] of [["She",true],["He",true],["They",false],["We",false],["The students",false]] as const)for(const tense of ["present","past","continuous"]){
 const correct=tense==="past"?past:tense==="continuous"?ing:singular?third:base;
 const stem=tense==="past"?`Yesterday, ${who.toLowerCase()} ___ ${object}.`:tense==="continuous"?`${who} ${singular?"is":"are"} ___ ${object} now.`:`${who} ___ ${object} every Sunday.`;
 const distractors=[base,third,past,ing,base+"ed",base+"s"].filter((x,i,a)=>x!==correct&&a.indexOf(x)===i).slice(0,3);
 concepts.push({subjectId:"english",topic:tense==="past"?"一般过去时":tense==="continuous"?"现在进行时":"一般现在时",stem,correct,others:distractors,explanation:tense==="past"?`Yesterday 提示一般过去时，使用 ${past}。`:tense==="continuous"?`现在进行时结构为 be + 动词-ing，因此填 ${ing}。`:`every Sunday 表示习惯动作；${singular?"主语是第三人称单数，使用":"主语是复数，使用原形"} ${correct}。`});
}
for(const subjectId of ["biology","chinese","english"] as const){const items=concepts.filter(c=>c.subjectId===subjectId);templates.push({id:subjectId+"-concepts",subjectId,topic:subjectId==="english"?"英语基础语法":subjectId==="biology"?"生物基础概念":"语文阅读与表达",difficulty:1,count:items.length,make:i=>{const c=items[i],options=[c.correct,...c.others],offset=i%4,rotated=options.slice(offset).concat(options.slice(0,offset));return {kind:"choice",stem:c.stem,options:rotated,answer:String.fromCharCode(65+rotated.indexOf(c.correct)),explanation:c.explanation}}})}
export const questionCatalog = templates.map(({id,subjectId,topic,difficulty,count})=>({id,subjectId,topic,difficulty,count,source}));
export const questionCount=questionCatalog.reduce((sum,t)=>sum+t.count,0);
export function generatedQuestion(id:string):SolvedQuestion|null {
 const m=/^g1:([a-z-]+):(\d+)$/.exec(id);if(!m)return null;
 const t=templates.find(t=>t.id===m[1]),i=Number(m[2]);if(!t||!Number.isSafeInteger(i)||i<0||i>=t.count)return null;
 return {id,subjectId:t.subjectId,topic:t.topic,difficulty:t.difficulty,kind:"number",options:[],source,...t.make(i)};
}
export function listGenerated(input:{subjectId?:string;topic?:string;difficulty?:number;q?:string;page:number;pageSize:number}) {
 const specs=questionCatalog.filter(t=>(!input.subjectId||input.subjectId===t.subjectId)&&(!input.topic||input.topic===t.id)&&(!input.difficulty||input.difficulty===t.difficulty)&&(!input.q||(t.topic+" "+t.subjectId).toLowerCase().includes(input.q.toLowerCase())));
 const total=specs.reduce((n,t)=>n+t.count,0),start=(input.page-1)*input.pageSize,items:SolvedQuestion[]=[];
 // Interleave topics, then skip completed short topics. Every variant has one stable index.
 let offset=start;
 const sorted=[...new Set(specs.map(t=>t.count))].sort((a,b)=>a-b);let level=0;
 for(const bound of sorted){const active=specs.filter(t=>t.count>level),size=(bound-level)*active.length;if(offset>=size){offset-=size;level=bound;continue}break}
 let row=level+Math.floor(offset/Math.max(1,specs.filter(t=>t.count>level).length)),col=offset%Math.max(1,specs.filter(t=>t.count>level).length);
 while(items.length<input.pageSize&&items.length+start<total){const active=specs.filter(t=>t.count>row);if(!active.length)break;for(;col<active.length&&items.length<input.pageSize;col++)items.push(generatedQuestion(`g1:${active[col].id}:${row}`)!);if(col===active.length){row++;col=0}}
 return {total,items};
}
const numberValue=(raw:string):number|null=>{const s=raw.trim().replaceAll("−","-");if(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))return Number(s);const m=/^([+-]?\d+)\s*\/\s*([+-]?\d+)$/.exec(s);return m&&Number(m[2])!==0?Number(m[1])/Number(m[2]):null};
export function checkAnswer(q:SolvedQuestion,answer:string):boolean {
 if(answer.length>200)return false;
 if(q.kind==="choice")return answer.trim().toUpperCase()===q.answer;
 if(q.kind==="text")return answer.trim().normalize("NFKC").toLowerCase()===q.answer.trim().normalize("NFKC").toLowerCase();
 if(q.kind==="roots"){const a=answer.split(/[,，;；\s]+/).filter(Boolean).map(numberValue),b=q.answer.split(",").map(Number);return a.length===2&&a.every(x=>x!==null)&&a.map(Number).sort((x,y)=>x-y).every((x,i)=>Math.abs(x-b.sort((x,y)=>x-y)[i])<1e-6)}
 const a=numberValue(answer),b=numberValue(q.answer);return a!==null&&b!==null&&Number.isFinite(a)&&Math.abs(a-b)<=0.00051;
}
export const publicQuestion=({answer,explanation,...q}:SolvedQuestion):PracticeQuestion=>q;
