// data.json 품질 점검 — 앱이 렌더링/채점할 수 없는 데이터를 찾아냅니다.
// 사용법: node check.mjs
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const units = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));

const errors = [];
const warns = [];
const typeCount = {};
let total = 0;

units.forEach((u, ui) => {
  const seenPrompts = new Map();
  u.lessons.forEach((l, li) => {
    l.questions.forEach((q, qi) => {
      total++;
      typeCount[q.type] = (typeCount[q.type] || 0) + 1;
      const tag = `U${ui + 1}-L${li + 1}-Q${qi + 1}(${q.type})`;

      if (!q.prompt || !q.prompt.trim()) errors.push(`${tag}: prompt 비어 있음`);
      if (!q.explanation || !q.explanation.trim()) errors.push(`${tag}: explanation 비어 있음`);

      // 유닛 내 중복 지문
      const key = (q.prompt || '').replace(/\s/g, '');
      if (seenPrompts.has(key)) warns.push(`${tag}: ${seenPrompts.get(key)}와 지문 중복`);
      else seenPrompts.set(key, tag);

      if (q.type === 'choice' || q.type === 'blank') {
        if (!Array.isArray(q.options) || q.options.length !== 4) errors.push(`${tag}: options가 4개가 아님`);
        else {
          if (new Set(q.options).size !== 4) errors.push(`${tag}: 보기 중복 — ${q.options.join(' / ')}`);
          q.options.forEach((o, i) => { if (!o || !o.trim()) errors.push(`${tag}: 보기 ${i + 1} 비어 있음`); });
        }
        if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) errors.push(`${tag}: answerIndex 범위 오류(${q.answerIndex})`);
        if (q.type === 'blank') {
          const n = (q.prompt.match(/___/g) || []).length;
          if (n === 0) errors.push(`${tag}: prompt에 "___" 없음`);
          if (n > 1) warns.push(`${tag}: "___"가 ${n}개 — 첫 번째만 빈칸으로 렌더링됨`);
        }
        if ('answerBool' in q) warns.push(`${tag}: 불필요한 answerBool`);
      }
      else if (q.type === 'ox') {
        if (typeof q.answerBool !== 'boolean') errors.push(`${tag}: answerBool 없음`);
        if (q.options) warns.push(`${tag}: ox에 불필요한 options`);
      }
      else if (q.type === 'match') {
        if (!Array.isArray(q.pairs) || q.pairs.length !== 4) errors.push(`${tag}: pairs가 4개가 아님`);
        else {
          const L = q.pairs.map(p => p[0]), R = q.pairs.map(p => p[1]);
          if (new Set(L).size !== 4) errors.push(`${tag}: 왼쪽 항목 중복 — 채점 불가`);
          if (new Set(R).size !== 4) errors.push(`${tag}: 오른쪽 항목 중복 — 채점 불가`);
          [...L, ...R].forEach(v => {
            if (!v || !v.trim()) errors.push(`${tag}: 빈 항목`);
            else if (v.length > 16) warns.push(`${tag}: 항목이 김(${v.length}자) — "${v}"`);
          });
        }
      }
      else if (q.type === 'order') {
        if (!Array.isArray(q.sequence) || q.sequence.length < 3 || q.sequence.length > 5) errors.push(`${tag}: sequence 길이 오류`);
        else {
          if (new Set(q.sequence).size !== q.sequence.length) errors.push(`${tag}: 순서 항목 중복 — 채점 불가`);
          q.sequence.forEach(v => { if (v.length > 20) warns.push(`${tag}: 순서 항목이 김(${v.length}자) — "${v}"`); });
        }
      }
      else errors.push(`${tag}: 알 수 없는 유형`);
    });
  });
});

// 유형 배분 확인
console.log(`문항 ${total}개 / 유닛 ${units.length}개 / 레슨 ${units.reduce((s, u) => s + u.lessons.length, 0)}개`);
console.log('유형 분포:', Object.entries(typeCount).map(([k, v]) => `${k} ${v}`).join(', '));
if (warns.length) console.log(`\n[경고 ${warns.length}건]\n` + warns.join('\n'));
if (errors.length) { console.error(`\n[오류 ${errors.length}건]\n` + errors.join('\n')); process.exit(1); }
console.log('\n오류 없음 — 앱에 사용할 수 있습니다.');
