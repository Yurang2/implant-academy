// 유닛을 넘나드는 중복 점검 — 같은 지식을 다른 문장으로 반복해 묻는 문항을 찾습니다.
// 사용법: node dupcheck.mjs
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const units = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));

// 문항을 "무엇을 묻는가"로 환원: 지문 + 정답 텍스트를 합쳐 토큰화
const STOP = new Set(['무엇','무엇일까요','것은','것을','가장','알맞은','옳은','다음','대한','설명으로','이유는','경우','때','수','있는','합니다','입니다','하는','되는','보세요','알맞게','짝지어','배열해','순서대로','그','이','저','와','과','를','을','는','은','이런','어떤','해야','할까요','까요','위해','따라','또는','모두','중']);

function answerText(q) {
  if (q.type === 'choice' || q.type === 'blank') return q.options[q.answerIndex] || '';
  if (q.type === 'ox') return q.answerBool ? '참' : '거짓';
  if (q.type === 'match') return q.pairs.map(p => p.join('')).join(' ');
  if (q.type === 'order') return q.sequence.join(' ');
  return '';
}

function tokens(q) {
  const text = (q.prompt + ' ' + answerText(q))
    .replace(/[^가-힣a-zA-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2 && !STOP.has(w));
  return new Set(text);
}

function jaccard(a, b) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

const all = [];
units.forEach((u, ui) => u.lessons.forEach((l, li) => l.questions.forEach((q, qi) => {
  all.push({
    tag: `U${ui + 1}(${u.title}) L${li + 1} Q${qi + 1}`,
    unit: ui,
    prompt: q.prompt,
    type: q.type,
    ans: answerText(q),
    tok: tokens(q),
  });
})));

const HIGH = 0.55;   // 사실상 같은 문항
const MED = 0.42;    // 겹치는 주제 — 검토 권장
const hits = [];
for (let i = 0; i < all.length; i++) {
  for (let j = i + 1; j < all.length; j++) {
    const s = jaccard(all[i].tok, all[j].tok);
    if (s >= MED) hits.push({ s, a: all[i], b: all[j] });
  }
}
hits.sort((x, y) => y.s - x.s);

console.log(`문항 ${all.length}개 교차 비교 (유닛 내 + 유닛 간)\n`);
const high = hits.filter(h => h.s >= HIGH);
const med = hits.filter(h => h.s < HIGH);

if (!hits.length) {
  console.log('유사도 ' + MED + ' 이상인 문항 쌍 없음 — 중복 없음.');
} else {
  if (high.length) {
    console.log(`■ 중복 의심 (유사도 ≥ ${HIGH}) — ${high.length}쌍`);
    high.forEach(h => {
      console.log(`\n  [${h.s.toFixed(2)}] ${h.a.unit === h.b.unit ? '같은 유닛' : '유닛 간'}`);
      console.log(`   A ${h.a.tag} (${h.a.type})\n     ${h.a.prompt}\n     → ${h.a.ans}`);
      console.log(`   B ${h.b.tag} (${h.b.type})\n     ${h.b.prompt}\n     → ${h.b.ans}`);
    });
    console.log('');
  }
  if (med.length) {
    console.log(`■ 주제 겹침 (유사도 ${MED}~${HIGH}) — ${med.length}쌍 (같은 주제를 다른 각도로 묻는 것은 정상)`);
    med.forEach(h => console.log(`  [${h.s.toFixed(2)}] ${h.a.tag} ↔ ${h.b.tag}  |  ${h.a.prompt.slice(0, 34)}… ↔ ${h.b.prompt.slice(0, 34)}…`));
  }
}

process.exit(high.length ? 1 : 0);
