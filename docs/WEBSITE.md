# 다운로드 페이지

`docs/index.html`을 시작으로 하는 빌드 없는 정적 사이트입니다. 기존 게임 디자인 시안과 개발 문서는 유지합니다.

## 미리보기

저장소 루트에서:

```sh
python3 -m http.server 4173 --directory docs --bind 127.0.0.1
```

http://localhost:4173 에 접속하세요. HTML 파일을 직접 열어도 디자인은 확인할 수 있지만 댓글은 HTTP(S) 주소가 필요합니다.

## GitHub Pages 공개

저장소에 파일을 커밋하고 푸시한 다음 GitHub의 **Settings → Pages → Deploy from a branch**에서 배포할 브랜치와 **/docs** 폴더를 선택합니다. 사이트 주소는 `https://yogurt-c.github.io/overlay-lupin/`입니다. 이 작업에서 원격 설정을 변경하거나 사이트를 배포하지는 않았습니다.

## 익명 댓글 연결 (최초 1회)

현재 방명록은 닉네임과 내용만 받는 익명 입력 UI입니다. Supabase 무료 프로젝트를 만들면 여러 방문자의 댓글을 공유할 수 있습니다.

1. Supabase에서 `comments` 테이블을 만들고 `name text`, `body text`, `created_at timestamptz default now()` 컬럼을 추가합니다.
2. 익명 방문자가 읽고 추가할 수 있도록 RLS 정책을 설정합니다. 삭제 권한은 공개하지 말고 Supabase 대시보드에서 관리하세요.
3. `docs/site.js`의 `commentsConfig`에 프로젝트 URL과 anon key를 넣습니다. anon key는 브라우저 공개용 키만 사용하세요.

SQL Editor에서 사용할 수 있는 최소 정책은 다음과 같습니다.

```sql
alter table comments enable row level security;
create policy "public can read comments" on comments for select using (true);
create policy "public can add comments" on comments for insert with check (char_length(name) between 1 and 24 and char_length(body) between 1 and 500);
```

현재 페이지에는 Supabase URL과 브라우저 공개용 publishable key가 연결되어 있어 댓글이 모든 방문자에게 공유됩니다. 스팸 방지를 강화하려면 CAPTCHA와 rate limit을 추가하는 것을 권장합니다.

## 다운로드 및 유지보수

- 페이지가 열리면 GitHub API에서 최신 릴리스의 DMG/EXE 자산을 찾습니다.
- API 제한/실패, JavaScript 비활성화 시에는 최신 릴리스 페이지로 연결됩니다.
- 게임 스크린샷은 `docs/site-assets/game-*.png`에 있습니다. 소개 이미지를 바꿀 때 이 파일들과 `index.html`의 게임 설명을 함께 갱신하세요.
- 앱 소스/의존성 변경 없이 `site.css`, `site.js`, `index.html`만으로 동작합니다.
