// 트랙 안에서 같은 지식을 다른 문장으로 반복해 묻는 문항을 찾습니다.
// 사용법: node dupcheck.mjs
import { loadData } from './check.mjs';

const data = loadData(process.argv[2]);

// 영어 문장과 한국어 지문이 섞여 있으므로 두 언어 불용어를 함께 걷어낸다.
const STOP = new Set([
  // 한국어
  '무엇', '무엇일까요', '것은', '것을', '가장', '알맞은', '옳은', '다음', '대한', '설명으로',
  '이유는', '경우', '수', '있는', '합니다', '입니다', '하는', '되는', '보세요', '알맞게',
  '짝지어', '배열해', '순서대로', '어떤', '해야', '할까요', '까요', '위해', '따라', '또는',
  '모두', '표현은', '표현이다', '뜻은', '뜻이', '자연스러운', '쓰지', '않는', '묻는',
  '대답은', '대답', '알맞은것은', '나타내는', '바꾸면', '차이는',
  // 영어
  'a', 'an', 'the', 'is', 'are', 'am', 'was', 'were', 'be', 'to', 'of', 'in', 'on', 'at',
  'for', 'and', 'or', 'it', 'this', 'that', 'you', 'your', 'i', 'my', 'me', 'we', 'do',
  'does', 'did', 'can', 'could', 'would', 'will', 'please', 'what', 'how', 'where', 'when',
  'yes', 'no', 'one', 'here', 'there', 'very', 'so',
]);

function answerText(q) {
  if (q.type === 'choice' || q.type === 'blank' || q.type === 'listen') return (q.options || [])[q.answerIndex] || '';
  if (q.type === 'ox') return q.answerBool ? '참' : '거짓';
  if (q.type === 'match') return (q.pairs || []).map(p => p.join('')).join(' ');
  if (q.type === 'order') return (q.sequence || []).join(' ');
  if (q.type === 'wordbank') return q.answer || '';
  if (q.type === 'speak') return q.text || '';
  return '';
}
const promptText = (q) => q.prompt || q.audio || q.text || '';

function tokens(q) {
  const text = (promptText(q) + ' ' + answerText(q))
    .toLowerCase()
    .replace(/[^가-힣a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2 && !STOP.has(w));
  return new Set(text);
}

// 한쪽만 부정문이면 긍정↔부정 대조 훈련이다 (문법 유닛의 정석) — 낭비가 아니다
const NEG = /\b(don't|doesn't|didn't|isn't|aren't|wasn't|weren't|won't|not|never)\b/i;
const isNegationContrast = (a, b) => {
  const na = NEG.test(a.prompt + ' ' + a.ans), nb = NEG.test(b.prompt + ' ' + b.ans);
  return na !== nb;
};

function jaccard(a, b) {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

const HIGH = 0.55;  // 사실상 같은 문항
const MED = 0.42;   // 겹치는 주제 — 검토 권장

let failed = 0;

(data.tracks || []).filter(t => t.status === 'live' && (t.units || []).length).forEach(track => {
  const all = [];
  track.units.forEach((u, ui) => u.lessons.forEach((l, li) => l.questions.forEach((q, qi) => {
    all.push({
      tag: `U${ui + 1}(${u.title}) L${li + 1} Q${qi + 1}`,
      unit: ui, li, band: u.band || '',
      prompt: promptText(q),
      type: q.type,
      ans: answerText(q),
      tok: tokens(q),
    });
  })));

  // 문법 축을 도입한 뒤로 "같은 문장의 반복"은 대부분 의도된 설계다. 세 가지를 걸러낸다:
  //  1) 같은 유닛 안의 반복 — 평서문↔의문문↔부정문 변형 훈련이 그 유닛의 목적이다
  //  2) 내용어가 2개 이하인 문항 — 불용어를 걷어내면 남는 게 없어 유사도가 무의미해진다
  //  3) 다른 밴드 사이의 반복 — 배운 표현을 상위 밴드에서 다시 쓰는 나선형 복습이다
  // 남는 것: 같은 밴드의 다른 유닛이 같은 것을 묻는 진짜 낭비.
  const MIN_TOK = 3;
  const hits = [];
  const skipped = { sameUnit: 0, tooShort: 0, crossBand: 0 };
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const A = all[i], B = all[j];
      if (A.unit === B.unit) { skipped.sameUnit++; continue; }
      if (A.tok.size < MIN_TOK || B.tok.size < MIN_TOK) { skipped.tooShort++; continue; }
      if (A.band !== B.band) { skipped.crossBand++; continue; }
      const s = jaccard(A.tok, B.tok);
      if (s >= MED) hits.push({ s, a: A, b: B, contrast: isNegationContrast(A, B) });
    }
  }
  console.log(`제외: 같은 유닛 내 변형 ${skipped.sameUnit}쌍 · 내용어 부족 ${skipped.tooShort}쌍 · 밴드 간 복습 ${skipped.crossBand}쌍`);
  hits.sort((x, y) => y.s - x.s);

  console.log(`\n=== ${track.title} (${track.id}) — 문항 ${all.length}개 교차 비교 ===`);
  const contrast = hits.filter(h => h.contrast);
  const real = hits.filter(h => !h.contrast);
  const high = real.filter(h => h.s >= HIGH);
  const med = real.filter(h => h.s < HIGH);
  if (contrast.length) {
    console.log(`\n□ 긍정↔부정 대조 ${contrast.length}쌍 — 의도된 훈련이므로 낭비로 세지 않습니다`);
    contrast.forEach(h => console.log(`  [${h.s.toFixed(2)}] ${h.a.tag} ↔ ${h.b.tag}`));
  }

  if (!real.length) {
    console.log(`유사도 ${MED} 이상인 문항 쌍 없음 — 중복 없음.`);
    return;
  }
  if (high.length) {
    failed += high.length;
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
});

process.exit(failed ? 1 : 0);
