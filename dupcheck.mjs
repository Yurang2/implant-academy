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
  // 영어
  'a', 'an', 'the', 'is', 'are', 'am', 'was', 'were', 'be', 'to', 'of', 'in', 'on', 'at',
  'for', 'and', 'or', 'it', 'this', 'that', 'you', 'your', 'i', 'my', 'me', 'we', 'do',
  'does', 'did', 'can', 'could', 'would', 'will', 'please', 'what', 'how', 'where', 'when',
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
      unit: ui, li,
      prompt: promptText(q),
      type: q.type,
      ans: answerText(q),
      tok: tokens(q),
    });
  })));

  const hits = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      // 같은 레슨 안의 반복은 템플릿이 의도한 스캐폴딩이다 — 인식 문항이 wordbank/speak가
      // 산출할 목표 문장을 먼저 노출하는 구조(DESIGN.md §2). 레슨을 넘는 반복만 비교한다.
      if (all[i].unit === all[j].unit && all[i].li === all[j].li) continue;
      const s = jaccard(all[i].tok, all[j].tok);
      if (s >= MED) hits.push({ s, a: all[i], b: all[j] });
    }
  }
  hits.sort((x, y) => y.s - x.s);

  console.log(`\n=== ${track.title} (${track.id}) — 문항 ${all.length}개 교차 비교 ===`);
  const high = hits.filter(h => h.s >= HIGH);
  const med = hits.filter(h => h.s < HIGH);

  if (!hits.length) {
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
