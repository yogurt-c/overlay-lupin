# 로컬 개발

배포용 빌드(서명/공증, Windows 크로스빌드)는 [RELEASE.md](RELEASE.md) 참고. 여기는 로컬에서 돌려보고 테스트하는 법만 다룸.

```
npm install
npm run dev      # 빌드 후 실행
npm test         # 전체 게임 시뮬레이션 및 동물탑 동기화 테스트
npm run test:tower-ui # Electron 동물탑 UI/두 창 대전 검사
```

## 매칭 구조

상대/방 찾기는 UDP 브로드캐스트(포트 47474) 방식이라 **같은 Wi-Fi/LAN**에 있어야 매칭됩니다. 서버 없이 로컬 네트워크 안에서만 동작하며, 구조는 `src/main/network.ts` 참고.

- 축구 등 1:1 게임: INVITE/ACCEPT 핸드셰이크 → host/client가 직접 패킷 교환
- 세포키우기 등 N인 게임: 방장이 ROOM_OPEN을 브로드캐스트 → 참가자는 정원 내에서 자유 합류 → 방장이 시작하면 host-authoritative로 진행

## 새 게임 추가하기

`src/renderer/games/<game>/` 아래에 `GameModule` 계약(`src/renderer/games/types.ts`)을 구현하고 `src/renderer/games/registry.ts`에 등록. 축구류(같은 물리 엔진을 쓰는 공 스포츠)는 `src/renderer/lib/ballsport/`를 재사용해서 `GameRules`만 구현하면 되고, 완전히 다른 장르(세포키우기처럼)는 자체 엔진을 새로 짜면 됨.

동물탑 동물 그림은 `docs/animal-tower/index.html`의 SVG가 원본이다. 고치고 나서 `python3 scripts/import-tower-art.py`로 `src/renderer/games/tower/animals.ts`를 다시 만든 뒤 빌드·테스트를 돌린다. 빌드는 TypeScript 컴파일 후 물리 의존성을 로컬 ESM으로 번들링한다.

## 낚시 저장

수집함은 Electron `userData` 아래 `fishing-collection.json`에 저장한다. main 프로세스가 검증 후 임시 파일에 쓰고 fsync한 뒤 교체하며, `.bak`은 직전 정상 저장본이다. 기본 파일이 깨지면 `.bak`을 읽고, 둘 다 깨졌으면 빈 수집함으로 덮어쓰지 않는다. 가져오기 전에는 `.before-import`를 남기고 개체 ID로 병합한다. 저장 형식 버전 2에서 물고기 크기 범위가 바뀌었다. 버전 1 저장본과 내보내기 파일은 읽을 때 옛 범위에서의 상대 위치를 유지한 채 새 범위로 변환되고(`migrateSave`), 첫 로드 때 원본이 `.bak`으로 남는다.

빌드의 `build:fishing-store` 단계는 main용 저장 모듈과 공통 카탈로그를 CommonJS로 따로 묶는다. renderer용 ESM 출력이 main용 공유 모듈 출력을 덮어쓰는 문제를 피하기 위한 것이라 지우면 안 된다.
