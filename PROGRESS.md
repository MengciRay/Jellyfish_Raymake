# 开发记录

## 2026-09-28 · 第一个可玩原型

- 建立 Electron、TypeScript、PixiJS 项目与 GitHub Actions 构建检查。
- 实现 100 碱基基因、基因表达、双亲重组和随机突变。
- 实现桌面水母游动、Verlet 触手、点击拖动、投喂、繁殖和本地存档。
- 添加基因与养护生命周期测试；`npm test` 6 项通过，`npm run build` 通过。
- 添加 Windows ZIP 产物工作流；本机 `npm run package:win` 已生成便携版 ZIP。

## 下一步

1. 在 Windows 桌面实际检查鼠标穿透、拖动、窗口层级和高 DPI 表现。
2. 给繁殖结果增加双亲与子代特征对比，让基因继承更直观。
3. 加入成长与投喂动画、稀有形状的更多表现。
