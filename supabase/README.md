# 게임별 이용 통계 설치

기존 프로젝트 `osedhkweibdubwccpqeh`를 사용합니다. 방명록과 다운로드 테이블은 수정하지 않습니다.
새 테이블·함수의 이름이 이미 있다면 SQL을 중단하고 기존 설정을 먼저 확인하세요.

## 1. 테이블 만들기

Supabase → SQL Editor → New query에서 `migrations/202610070001_game_plays.sql` 전체를 붙여넣고 **Run**을 누릅니다.
권한을 제한하는 `REVOKE` 문도 포함하므로 전체를 한 번에 실행하세요. 이 파일은 최초 설치용입니다.

## 2. 수집 함수 배포

1. Edge Functions → 새 함수 → 편집기로 생성합니다.
2. 함수 이름을 **`game-telemetry`**로 지정합니다.
3. `functions/game-telemetry/index.ts` 전체를 `index.ts`에 붙여넣고 배포합니다.
4. 이 함수의 설정에서 **Verify JWT / Enforce JWT verification**을 끄고 저장합니다.
   앱은 로그인 JWT 대신 공개 publishable key를 `apikey` 헤더로 전송하고, 함수 안에서 해당 키를 확인합니다.
   공개 키는 사용자를 인증하거나 위조를 막는 비밀 키가 아닙니다.

서버의 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 Supabase가 제공하는 기본 환경 변수입니다.
관리자 키를 앱이나 홈페이지에 복사하지 마세요. 추가 키를 전달할 필요는 없습니다.

CLI 사용 시 `supabase functions deploy game-telemetry --project-ref osedhkweibdubwccpqeh --no-verify-jwt`로 배포할 수도 있습니다.

## 3. 확인

패키징된 새 앱에서 설정 → **게임 이용 통계 보내기 (선택)**를 켜고 게임을 시작합니다.
앱을 1분 이상 켜둔 뒤 SQL Editor에서 실행합니다.

```sql
select game_id, mode, app_version, played_at
from public.game_play_events
order by received_at desc
limit 20;
```

개발 실행(`npm run dev`)은 운영 통계로 전송하지 않습니다. 기존 배포 버전에는 이 기능이 없습니다.
401 오류는 함수 JWT 설정, 503 오류는 테이블·RPC 적용과 기본 환경 변수를 확인하세요.
원본 테이블은 공개 키로 조회할 수 없도록 막았으므로 반드시 대시보드에서 확인합니다.

## 통계 보기

SQL Editor에서 `game-stats.sql`을 실행합니다. 최근 7일(오늘 포함, 한국 시간)의 게임별
플레이 횟수·설치 수·비율·혼자/멀티 횟수를 보여줍니다. `7`을 `30`으로 바꾸면 최근 30일입니다.
이용자 비율의 합은 한 설치가 여러 게임을 하므로 100%를 넘을 수 있습니다.
이용자는 사람이 아닌 설치 ID 기준이며, 수집 참여 설정을 끄면 다음 참여 때 ID가 바뀝니다.

## 가볍게 수집하는 범위

- 게임 시작 때만 비동기 IPC 한 번. 메인 프로세스의 메모리에 기록을 추가합니다.
- 게임 루프·입력·LAN 전송·종료 흐름에 대기나 수집 코드를 추가하지 않습니다.
- 1분마다 최대 50건을 비동기로 저장·전송합니다. 요청은 5초 뒤 취소하고 실패하면 재시도 간격을 늘립니다.
- 미전송 기록은 최대 1,000건·7일입니다. 앱 종료를 지연시키지 않아 최근 1분의 미저장 기록은 누락될 수 있습니다.
- 기본 수집 꺼짐. 설정에서 켠 후 새로 시작한 게임만 기록하고, 끄면 미전송 기록을 지웁니다.
  이미 서버에 도착한 기록은 설정을 끄는 것만으로 삭제되지 않습니다.
- 같은 이벤트의 재전송은 한 번만 저장됩니다. 멀티플레이는 참여자별로 1회씩 집계합니다.
- 기록 항목: 무작위 이벤트/설치 ID, 게임 ID, 모드, 앱 버전, OS, 시작 시각.
  닉네임·키 입력·플레이 시간·화면 녹화·IP 주소를 통계 테이블에 저장하지 않습니다.
  서비스 자체의 인프라 요청 로그는 별개입니다.
- 공개 클라이언트 통계는 추세 파악용입니다. 설치별 요청량 제한은 있지만 ID를 바꾸는 위조나
  함수 호출 자체의 비용을 완전히 막지는 못합니다. 사용량은 기존 프로젝트와 공유합니다.

## 로컬 검증

`npm run test:analytics`는 동의 설정, 오프라인 재시도, 지연된 응답, 취소, 대기열 제한,
수집 함수의 입력 검증을 확인합니다. `tests/analytics-database.sql`은 격리된 Postgres에서
Supabase 역할(`anon`, `authenticated`, RLS 우회 권한이 있는 `service_role`)을 만들고
마이그레이션을 적용한 후 실행하는 테스트입니다. 운영 DB에서는 실행하지 마세요.

공식 참고: [함수 인증](https://supabase.com/docs/guides/functions/auth),
[기본 환경 변수](https://supabase.com/docs/guides/functions/secrets),
[대시보드 배포](https://supabase.com/docs/guides/functions/quickstart-dashboard).
