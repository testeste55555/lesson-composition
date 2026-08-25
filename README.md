# lesson-composition

授業形態を、学習者の発話・行動、授業運営、教室条件、元授業の特徴から検討するための観点別チェックシートです。

## 構成

- `/` : PC版／スマホ版の入口
- `/pc/` : PC版
- `/mobile/` : スマホ版
- `/assets/` : PC・スマホ共通の判定ロジックと共通CSS

PC版とスマホ版は同じ判定ロジックを共有しています。チェック項目や判定基準を更新する場合は、原則として `assets/app.js` を更新してください。

## GitHub Pages 公開後のURL

- 入口: `https://testeste55555.github.io/lesson-composition/`
- PC版: `https://testeste55555.github.io/lesson-composition/pc/`
- スマホ版: `https://testeste55555.github.io/lesson-composition/mobile/`

スマホ版はタップ操作、1列表示、画面下部の判定ボタン、端末内でのチェック状態保存、Service Workerによる再訪時のキャッシュに対応しています。
