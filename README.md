# knotStreet · 乾淨的神經 · 紐結環 (Neural Knot)

▶ **線上試玩：https://rolanthhuang.github.io/knotStreet/**

沿 T(5,2) 環面紐結展開的 3D 拱廊街道城市（Three.js，單檔 HTML），可第一／第三人稱步行與飛行。
靈感：Goodfire〈Neural Networks Are Already Clean〉標題圖。

- 環長約 3760 m、15 個廣場（6 個地標）、兩排程序化生成且不重複的極簡建築
- 玩法：WASD 移動、Shift 奔跑、Space 跳、V 視角、F 飛行、M 地圖、1–8 傳送、H 隱藏介面、R 重生
- 若滑鼠鎖定失敗：拖曳轉視角，或用整頁開啟

## 建置
```
npm install
node build.mjs            # → dist/index.html（紐結環，預設）
node build.mjs --island   # → dist/island.html（浮島版）
```
`dist/index.html` 已含建置結果。線上試玩：https://rolanthhuang.github.io/knotStreet/
