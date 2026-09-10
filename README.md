<div align="center">

# 오버레이 루팡
### Overlay Lupin

같은 Wi-Fi/LAN에서 즉석으로 붙는, 화면 위에 몰래 떠 있는 1:1 대두축구 미니게임 (Electron)

[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple&logoColor=white)](#)
[![Electron](https://img.shields.io/badge/built%20with-Electron-47848F?logo=electron&logoColor=white)](#)
[![Notarized](https://img.shields.io/badge/Apple-Notarized-000000?logo=apple&logoColor=white)](#)

### [⬇️ Mac용 최신 버전 다운로드](https://github.com/yogurt-c/overlay-lupin/releases/latest)

<br/>

<img src="assets/screenshot-invite.png" alt="대전 신청 알림 화면" width="46%" />&nbsp;&nbsp;
<img src="assets/screenshot-match.png" alt="1:1 대두축구 경기 화면" width="46%" />

</div>

---

## 개발

```
npm install
npm run dev      # 빌드 후 실행
npm test         # 시뮬레이션 물리 테스트 (28개 체크)
```

상대 찾기는 UDP 브로드캐스트(포트 47474) 방식이라 **같은 Wi-Fi/LAN**에 있어야 매칭됩니다.

## macOS 배포 빌드

### 사전 준비 (최초 1회만, 이미 완료됨)

이 컴퓨터에는 이미 다음이 세팅되어 있습니다:

- **Developer ID Application 인증서**: 키체인에 설치됨 (`Developer ID Application: Hyeongi Shin (T73H8RU4C2)`)
- **notarytool 자격 증명**: 프로필 이름 `ghostpitch-notary` 로 키체인에 저장됨
  - Apple ID: `shinzzang0424@icloud.com`
  - Team ID: `T73H8RU4C2`

**다른 컴퓨터에서 새로 세팅해야 한다면:**

1. CSR 생성 (개인키는 로컬에만 보관):
   ```
   openssl req -new -newkey rsa:2048 -nodes \
     -keyout developerID_application.key \
     -out developerID_application.csr \
     -subj "/C=KR/CN=Overlay Lupin Developer ID"
   ```
2. https://developer.apple.com/account/resources/certificates/add → **Developer ID Application** 선택
   - Profile Type은 **G2 Sub-CA**로 선택 (Previous Sub-CA는 2027년 1월 만료 예정인 구버전 레거시라 선택 금지)
   - 위에서 만든 `.csr` 업로드 → 발급된 `.cer` 다운로드
3. 인증서 + 개인키 + Apple 중간 인증서를 키체인에 설치:
   ```
   security import developerID_application.key -k ~/Library/Keychains/login.keychain-db -A
   security import developerID_application.cer -k ~/Library/Keychains/login.keychain-db -A
   curl -fsSL -o DeveloperIDG2CA.cer https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer
   security import DeveloperIDG2CA.cer -k ~/Library/Keychains/login.keychain-db -A
   ```
   `security find-identity -v -p codesigning` 에서 `1 valid identities found`가 나오면 성공.
4. appleid.apple.com → 로그인 및 보안 → **앱 전용 암호**에서 새로 생성 (기존 걸 기억하려 하지 말고 매번 새로 만들어서 바로 복사해서 쓸 것 — Apple은 생성 직후 한 번만 보여주고 다시는 안 보여줌).
5. notarytool 자격 증명 저장 (비밀번호는 프롬프트에서 직접 입력, 스크립트에 하드코딩 금지):
   ```
   xcrun notarytool store-credentials "ghostpitch-notary" \
     --apple-id "본인 Apple ID" \
     --team-id "본인 Team ID" \
     --keychain "$HOME/Library/Keychains/login.keychain-db"
   ```
   **`--keychain` 경로를 반드시 명시할 것.** 생략하면 notarytool이 iCloud 키체인 쪽을 기본으로 타는데, 이게 왜인지 조회 시 안정적으로 안 잡히는 경우가 있었음 (`No Keychain password item found` 에러 — 실제로는 자격 증명이 없어서가 아니라 비밀번호 자체가 틀렸는데 에러 메시지가 이렇게 뜬 것일 수도 있으니, 401 에러 여부부터 확인).
   저장 후 바로 검증:
   ```
   xcrun notarytool history --keychain-profile "ghostpitch-notary" --keychain "$HOME/Library/Keychains/login.keychain-db"
   ```

### 빌드 (평소에 이거 한 줄이면 됨)

```
APPLE_KEYCHAIN="$HOME/Library/Keychains/login.keychain-db" \
APPLE_KEYCHAIN_PROFILE="ghostpitch-notary" \
npm run release:mac
```

- 결과물: `release/오버레이 루팡-x.x.x-universal.dmg` (x64 + arm64 유니버설, 인텔/애플실리콘 둘 다 실행 가능)
- 로그에 `notarization successful`이 뜨면 정상. 서명 + Apple 공증까지 끝난 상태라 받는 사람이 별도 조치(우클릭 열기, xattr, 시스템 설정 등) 없이 바로 더블클릭해서 열 수 있음.
- 첫 공증 제출은 Apple 서버 처리 때문에 몇 분 걸릴 수 있음.

### 확인 (선택)

```
spctl -a -vv "release/mac-universal/오버레이 루팡.app"   # "accepted / source=Notarized Developer ID" 나와야 정상
xcrun stapler validate "release/mac-universal/오버레이 루팡.app"
```

### 배포

`release/*.dmg` 파일을 AirDrop이나 파일 전송으로 그대로 넘기면 됨. 받는 사람은 dmg 열어서 Applications로 드래그 후 더블클릭.

**주의**: 공증되지 않은(서명 없이 ad-hoc로만 빌드한) 과거 버전은 macOS Sequoia 이후부터 우클릭 열기 우회가 막혀서, "손상되었습니다" 오류가 뜰 수 있음 — 지금은 정식 공증이 붙어서 해당 없음.
