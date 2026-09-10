# 로컬 개발

배포용 빌드(서명/공증, Windows 크로스빌드)는 [RELEASE.md](RELEASE.md) 참고. 여기는 로컬에서 돌려보고 테스트하는 법만 다룸.

```
npm install
npm run dev      # 빌드 후 실행
npm test         # 시뮬레이션 물리 테스트 (39개 체크: 대두축구 + 세포키우기)
```

## 매칭 구조

상대/방 찾기는 UDP 브로드캐스트(포트 47474) 방식이라 **같은 Wi-Fi/LAN**에 있어야 매칭됩니다. 서버 없이 로컬 네트워크 안에서만 동작하며, 구조는 `src/main/network.ts` 참고.

- 축구 등 1:1 게임: INVITE/ACCEPT 핸드셰이크 → host/client가 직접 패킷 교환
- 세포키우기 등 N인 게임: 방장이 ROOM_OPEN을 브로드캐스트 → 참가자는 정원 내에서 자유 합류 → 방장이 시작하면 host-authoritative로 진행

## 새 게임 추가하기

`src/renderer/games/<game>/` 아래에 `GameModule` 계약(`src/renderer/games/types.ts`)을 구현하고 `src/renderer/games/registry.ts`에 등록. 축구류(같은 물리 엔진을 쓰는 공 스포츠)는 `src/renderer/lib/ballsport/`를 재사용해서 `GameRules`만 구현하면 되고, 완전히 다른 장르(세포키우기처럼)는 자체 엔진을 새로 짜면 됨.
