# US Market Thermometer

미국 증시 순유동성, 원화 환율, 옵션 포지셔닝, Fed 일정, VIX, 공포탐욕지수를 한 화면에서 보는 대시보드입니다.

## Overview

이 프로젝트는 매크로 유동성과 시장 심리를 빠르게 같이 보려는 목적의 경량 웹앱입니다.

- 미국 순유동성 차트
- 달러/원, 100엔/원 환율 패널
- 종목 검색과 최대 미결제약정 콜/풋옵션 요약
- 시장 온도계
- Fed FOMC 일정
- VIX, 공포탐욕지수

## Run

```bash
npm install
npm start
```

기본 주소는 `http://localhost:3000` 입니다.

## Data Sources

- `FRED`: `WALCL`, `WDTGAL`, `RRPONTSYD`, `DEXKOUS`, `DEXJPUS`, `VIXCLS`
- `Federal Reserve`: FOMC calendar
- `Nasdaq Trader`: 미국 상장 종목 검색용 심볼 목록
- `Nasdaq`: 옵션 체인 데이터
- `OnOff Markets`: 주식 공포탐욕지수

## Formula

```text
Net Liquidity = WALCL - (RRPONTSYD + WDTGAL)
USD/KRW = DEXKOUS
100 JPY/KRW = (DEXKOUS / DEXJPUS) * 100
```

참고:

- `WALCL`, `WDTGAL`은 백만 달러 단위입니다.
- `RRPONTSYD`는 십억 달러 단위라 서버에서 백만 달러 단위로 변환합니다.
- 엔/원은 한국에서 자주 쓰는 `100엔당 원화` 기준으로 표시합니다.
- 옵션 최대 물량은 `Open Interest` 기준입니다.

## Refresh Policy

- 순유동성 API 캐시: 5분
- 옵션 API 캐시: 30초
- 화면 자동 갱신: 순유동성 5분, 옵션 30초
- 탭이 다시 활성화되면 즉시 재조회

## Notes

- 옵션 데이터는 실시간 체결이 아니라 지연 데이터 기반입니다.
- `Open Interest`는 장중 실시간 값이 아니라 일 단위 성격이 강합니다.
- 무료 외부 데이터 구조가 바뀌면 파서 수정이 필요할 수 있습니다.
