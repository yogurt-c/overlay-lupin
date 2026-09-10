<div align="center">

# 오버레이 루팡
### Overlay Lupin

같은 Wi-Fi/LAN에서 즉석으로 붙는, 화면 위에 몰래 떠 있는 미니게임 모음 (Electron) — 1:1 대두축구, 최대 6인 세포키우기

[![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple&logoColor=white)](#)
[![Electron](https://img.shields.io/badge/built%20with-Electron-47848F?logo=electron&logoColor=white)](#)
[![Notarized](https://img.shields.io/badge/Apple-Notarized-000000?logo=apple&logoColor=white)](#)

### [⬇️ Mac용 최신 버전 다운로드](https://github.com/yogurt-c/overlay-lupin/releases/latest)

<br/>

<img src="assets/screenshot-invite.png" alt="대전 신청 알림 화면" width="30%" />&nbsp;&nbsp;
<img src="assets/screenshot-match.png" alt="1:1 대두축구 경기 화면" width="30%" />&nbsp;&nbsp;
<img src="assets/screenshot-cell.png" alt="세포키우기 경기 화면" width="30%" />

</div>

---

## 특징

- 화면 위에 떠 있는 투명 오버레이 — 다른 작업 하면서 바로 대전
- 같은 Wi-Fi/LAN에서 서버 없이 즉석 매칭 (UDP 브로드캐스트)
- **대두축구** — 손그림 스타일 1:1 대전, 5골 선취 매치
- **세포키우기** — 최대 6인, 방장이 방을 열면 자유롭게 참가·중도 합류. 점을 먹으며 커지고 나보다 작은 세포를 흡수, 큰 세포는 피하기. 제한시간 없이 방에 한 명이라도 남아있으면 계속 진행

## 개발

```
npm install
npm run dev      # 빌드 후 실행
npm test         # 시뮬레이션 물리 테스트 (39개 체크: 대두축구 + 세포키우기)
```

상대 찾기는 UDP 브로드캐스트(포트 47474) 방식이라 **같은 Wi-Fi/LAN**에 있어야 매칭됩니다.

## 배포 빌드

macOS 서명/공증 절차와 배포 방법은 [docs/RELEASE.md](docs/RELEASE.md) 참고.
