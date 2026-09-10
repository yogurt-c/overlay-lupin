# macOS 배포 빌드 가이드

메인테이너용 문서. 서명/공증 세팅과 배포 빌드 절차를 정리합니다.

## 알아둘 것

**`package.json`의 `build.productName`은 반드시 영문(ASCII)으로 유지할 것.** 한글(예: "오버레이 루팡")로 하면 `electron-builder`의 유니버설(x64+arm64 병합) 단계(`@electron/universal`)가 병합 후 앱을 찾지 못해 몇 분간 조용히 재시도하다 `Application at path "..." could not be found` 에러로 실패합니다. 영문 이름(`Overlay Lupin`)에서는 문제없습니다. 앱 내부 표시 이름(창 제목 등)은 한글로 둬도 무방 — 문제는 오직 빌드 산출물 폴더명이 되는 `productName` 필드입니다.

## 사전 준비 (컴퓨터당 최초 1회)

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
   `security find-identity -v -p codesigning` 에서 `1 valid identities found`가 나오면 성공. 여기 표시되는 `(TEAMID)`가 본인 Team ID입니다.
4. appleid.apple.com → 로그인 및 보안 → **앱 전용 암호**에서 새로 생성. 기존 걸 기억하려 하지 말고 매번 새로 만들어서 바로 복사해서 쓸 것 — Apple은 생성 직후 한 번만 보여주고 다시는 안 보여줍니다.
5. notarytool 자격 증명 저장 (비밀번호는 프롬프트에서 직접 입력, 스크립트에 하드코딩 금지). 이 프로젝트의 프로필 이름은 **`overlaylupin-notary`**:
   ```
   xcrun notarytool store-credentials "overlaylupin-notary" \
     --apple-id "<본인 Apple ID>" \
     --team-id "<본인 Team ID>" \
     --keychain "$HOME/Library/Keychains/login.keychain-db"
   ```
   **`--keychain` 경로를 반드시 명시할 것.** 생략하면 notarytool이 iCloud 키체인 쪽을 기본으로 타는데, 이게 왜인지 조회 시 안정적으로 안 잡히는 경우가 있었습니다 (`No Keychain password item found` 에러 — 실제로는 자격 증명이 없어서가 아니라 비밀번호 자체가 틀렸는데 에러 메시지가 이렇게 뜬 것일 수도 있으니, 401 에러 여부부터 확인).
   저장 후 바로 검증:
   ```
   xcrun notarytool history --keychain-profile "overlaylupin-notary" --keychain "$HOME/Library/Keychains/login.keychain-db"
   ```

## 빌드 (평소에 이거 한 줄이면 됨)

```
APPLE_KEYCHAIN="$HOME/Library/Keychains/login.keychain-db" \
APPLE_KEYCHAIN_PROFILE="overlaylupin-notary" \
npm run release:mac
```

- 결과물: `release/Overlay Lupin-x.x.x-universal.dmg` (x64 + arm64 유니버설, 인텔/애플실리콘 둘 다 실행 가능)
- 로그에 `notarization successful`이 뜨면 정상. 서명 + Apple 공증까지 끝난 상태라 받는 사람이 별도 조치(우클릭 열기, xattr, 시스템 설정 등) 없이 바로 더블클릭해서 열 수 있음.
- 첫 공증 제출은 Apple 서버 처리 때문에 몇 분 걸릴 수 있음.

## 확인 (선택)

```
spctl -a -vv "release/mac-universal/Overlay Lupin.app"   # "accepted / source=Notarized Developer ID" 나와야 정상
xcrun stapler validate "release/mac-universal/Overlay Lupin.app"
```

## 배포

`release/*.dmg` 파일을 GitHub Release에 올리거나 AirDrop/파일 전송으로 넘기면 됨. 받는 사람은 dmg 열어서 Applications로 드래그 후 더블클릭.

**주의**: 공증되지 않은(서명 없이 ad-hoc로만 빌드한) 과거 버전은 macOS Sequoia 이후부터 우클릭 열기 우회가 막혀서 "손상되었습니다" 오류가 뜰 수 있음 — 정식 공증이 붙은 빌드는 해당 없음.

---

# Windows 배포 빌드

## 사전 준비

- Windows 코드사이닝 인증서는 아직 없음 — 서명 없이 빌드하면 설치 시 SmartScreen에 "알 수 없는 게시자" 경고가 뜨지만 설치 자체는 가능("추가 정보 → 실행"으로 진행).
- 이 Mac에서 크로스 빌드하려면 **Wine**이 필요함 (`brew install --cask wine-stable` 또는 `brew install wine-stable`). 설치 안 돼 있으면 아래 빌드 명령이 실패함.
- 아이콘은 `build/icon.ico`로 이미 준비돼 있음 (`build/icon-1024-raw.png`에서 변환).

## 빌드

```
npm run release:win
```

- 결과물: `release/Overlay Lupin Setup x.x.x.exe` (NSIS 설치 파일, x64)
- Wine 없이 Windows 머신이나 CI(GitHub Actions windows-latest 러너 등)에서 직접 빌드해도 됨 — 그쪽에는 Wine이 필요 없음.

## 배포

`release/*.exe` 파일을 GitHub Release에 mac dmg와 함께 올리면 됨.
