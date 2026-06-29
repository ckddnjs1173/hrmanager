# 에셋 가이드 (여기에 올리면 자동 반영)

아래 **정확한 경로/파일명**으로 넣으면 사이트에 즉시 표시됩니다. 없으면 그라데이션/이니셜/텍스트로 자동 대체되어 화면이 깨지지 않습니다.

## 우선순위 높음
| 용도 | 경로 | 규격 |
|---|---|---|
| 근로자 사이트 히어로 영상 | `worker/hero.webm` + `worker/hero.mp4` | 1920×1080, 무음, ~10초 루프, 합계 5MB 권장 |
| 근로자 히어로 포스터 | `worker/hero-poster.jpg` | 1600×900 |
| 사업주 사이트 히어로 영상 | `employer/hero.webm` + `employer/hero.mp4` | 동일 |
| 사업주 히어로 포스터 | `employer/hero-poster.jpg` | 동일 |
| 로고 | `brand/logo.svg` | 가로형(높이 ~28px 기준) |
| 파비콘 | `brand/favicon.png` | 256×256 |
| 기본 공유 이미지 | `brand/og-default.png` | 1200×630 |

## 선택
| 용도 | 경로 | 규격 |
|---|---|---|
| 글 공유 이미지 | `og/<글key>.png` (wage, fire, severance, holiday, harass, contract, emp_risk …) | 1200×630 |
| 글 대표 이미지 | `guides/<글key>.jpg` | 1200×675 |
| 카테고리 배너 | `worker/cat-<cat>.jpg`, `employer/cat-<cat>.jpg` | 1600×400 |
| 노무사 프로필 | `nomusa/<id>.jpg` | 400×400 정사각 |
| 타일 아이콘 | `icons/<key>.svg` | 64×64 (없으면 이모지) |

> 영상이 없으면 포스터만으로도 동작하고, 둘 다 없으면 사이트별 그라데이션 배경이 표시됩니다.
