import {describe,it,expect} from 'vitest';
import {questionCatalog,questionCount,generatedQuestion,listGenerated,checkAnswer,publicQuestion} from '../shared/questions.js';
describe('原创题库：真实数量、分页和判分',()=>{
 it('所有题目稳定唯一且标准答案可判分',()=>{
  const ids=new Set<string>(),stems=new Set<string>();
  for(const t of questionCatalog)for(let i=0;i<t.count;i++){
   const q=generatedQuestion(`g1:${t.id}:${i}`)!;
   expect(q).toBeTruthy();if(ids.has(q.id)||stems.has(q.stem))throw Error('重复题目 '+q.id);
   ids.add(q.id);stems.add(q.stem);if(!checkAnswer(q,q.answer))throw Error('答案无效 '+q.id);
   if(q.kind==='choice')expect(new Set(q.options).size).toBe(q.options.length);
  }
  expect(ids.size).toBe(questionCount);expect(questionCount).toBe(157011);
 });
 it('跨短题型边界的分页不重复、不漏题',()=>{
  const seen=new Set<string>();for(let page=1;page<=Math.ceil(questionCount/50);page++)for(const q of listGenerated({page,pageSize:50}).items){if(seen.has(q.id))throw Error('重复分页 '+q.id);seen.add(q.id)}
  expect(seen.size).toBe(questionCount);expect(listGenerated({page:100000,pageSize:20}).items).toHaveLength(0);
 });
 it('独立验证方程与欧姆定律，拒绝脚本和不正确根',()=>{
  for(const i of [0,12,100,1999]){const q=generatedQuestion(`g1:ohm:${i}`)!;const numbers=q.stem.match(/\d+/g)!.map(Number);expect(Number(q.answer)).toBeCloseTo(numbers[1]/numbers[0],3)}
  const q=generatedQuestion('g1:quadratic:0')!;expect(checkAnswer(q,q.answer.split(',').reverse().join('，'))).toBe(true);expect(checkAnswer(q,'0,0')).toBe(false);
  expect(checkAnswer(generatedQuestion('g1:linear:0')!,'process.exit()')).toBe(false);
  expect(publicQuestion(q)).not.toHaveProperty('answer');expect(publicQuestion(q)).not.toHaveProperty('explanation');
 });
});
