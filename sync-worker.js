// 링고 아카데미 — 학습 기록 동기화 서버 (Cloudflare Worker)
//
// 무엇을 하나: 학습 기록(JSON 하나)을 슬롯 키로 저장/조회하는 초소형 API.
// 슬롯 키는 앱이 "동기화 코드 + 사용자 이름"을 SHA-256으로 해시해 만들므로
// 코드 원문은 서버로 전송되지 않는다. 키를 아는 사람만 그 슬롯을 읽고 쓸 수 있다
// (능력 URL 방식). 민감 정보가 아닌 학습 진도만 저장하는 것을 전제로 한다.
//
// 배포 방법은 DEPLOY.md의 "학습 기록 동기화 서버" 절 참고.
// 필요한 바인딩: KV 네임스페이스를 SYNC_KV 라는 이름으로 연결.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const m = new URL(req.url).pathname.match(/^\/v1\/state\/([a-f0-9]{64})$/);
    if (!m) return new Response('not found', { status: 404, headers: CORS });
    const key = 'u:' + m[1];

    if (req.method === 'GET') {
      const v = await env.SYNC_KV.get(key);
      if (v === null) return new Response('null', { status: 404, headers: CORS });
      return new Response(v, { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (req.method === 'PUT') {
      const body = await req.text();
      if (body.length > 64 * 1024) return new Response('too large', { status: 413, headers: CORS });
      try { JSON.parse(body); } catch (e) { return new Response('bad json', { status: 400, headers: CORS }); }
      await env.SYNC_KV.put(key, body);
      return new Response('{"ok":true}', { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    return new Response('method not allowed', { status: 405, headers: CORS });
  },
};
