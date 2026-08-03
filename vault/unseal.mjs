// vault 봉인 해제 / 재봉인 게이트
//
//   node vault/unseal.mjs --i-have-finished-level-design   봉인 해제
//   node vault/unseal.mjs --reseal                         다시 봉인
//
// 보안 장치가 아니라 실수 방지용 턱입니다. 자세한 배경은 vault/README.md 참고.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ARCHIVE = path.join(dir, 'track-b.v1.tar.gz');
const PLAIN = ['curriculum.json', 'TRACK-NOTES.md', 'MANIFEST.txt'];
const flags = new Set(process.argv.slice(2));

function die(msg) { console.error(msg); process.exit(1); }

if (flags.has('--reseal')) {
  const present = PLAIN.filter(f => fs.existsSync(path.join(dir, f)));
  if (!present.length) die('재봉인할 평문 파일이 없습니다. 이미 봉인된 상태입니다.');
  execFileSync('tar', ['czf', ARCHIVE, ...present], { cwd: dir });
  present.forEach(f => fs.unlinkSync(path.join(dir, f)));
  console.log(`재봉인 완료 — ${present.join(', ')} 를 ${path.basename(ARCHIVE)} 로 되돌리고 삭제했습니다.`);
  process.exit(0);
}

if (!flags.has('--i-have-finished-level-design')) {
  console.error(`
봉인된 상태입니다. 열지 않았습니다.

  Track B 원문은 Track A(영어)의 레벨 디자인이 확정된 뒤에 엽니다.
  체크리스트는 vault/README.md 를 보세요.

  정말 열어야 한다면:
    node vault/unseal.mjs --i-have-finished-level-design
`.trim());
  process.exit(2);
}

if (!fs.existsSync(ARCHIVE)) die(`아카이브가 없습니다: ${ARCHIVE}`);
execFileSync('tar', ['xzf', ARCHIVE], { cwd: dir });
console.log(`봉인 해제 — ${dir} 에 평문이 풀렸습니다.`);
console.log('작업이 끝나면 반드시 재봉인하세요:  node vault/unseal.mjs --reseal');
